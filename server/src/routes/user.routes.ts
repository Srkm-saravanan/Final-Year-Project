import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { recordAuditLog } from '../utils/audit.js';
import { hashPassword } from '../utils/password.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate);

const userIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

const roleEnum = z.enum(['Admin', 'Analyst', 'Executive', 'Viewer']);

const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().trim().email('Valid email is required'),
  role: roleEnum.default('Analyst'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .optional(),
});

const updateUserRoleSchema = z.object({
  role: roleEnum,
});

function toUserSummary(u: {
  id: string;
  name: string;
  email: string;
  status: string;
  lastActiveLabel: string;
  role: { name: string };
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.name,
    status: u.status,
    lastActive: u.lastActiveLabel,
  };
}

router.get(
  '/',
  requirePermission('users:read'),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: { role: true },
    });

    sendSuccess(res, {
      users: users.map(toUserSummary),
    });
  })
);

router.post(
  '/',
  requirePermission('users:create'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createUserSchema>;
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'A user with this email already exists.');
    }

    const roleRecord = await prisma.role.findUnique({ where: { name: body.role } });
    if (!roleRecord) {
      throw new AppError(400, 'INVALID_ROLE', `Unknown role "${body.role}".`);
    }

    // Never store plaintext passwords; use provided credential or generate high-entropy token for invite
    const initialSecret = body.password ?? crypto.randomBytes(24).toString('hex');
    const passwordHash = await hashPassword(initialSecret);

    const created = await prisma.user.create({
      data: {
        name: body.name,
        email,
        passwordHash,
        roleId: roleRecord.id,
        status: body.password ? 'Active' : 'Invited',
        lastActiveLabel: body.password ? 'Active now' : 'Pending activation',
      },
      include: { role: true },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Invited User to Platform',
      target: `${created.name} (${created.role.name})`,
      status: 'Success',
      alwaysRecord: true,
    });

    sendSuccess(res, { user: toUserSummary(created) }, 201);
  })
);

router.patch(
  '/:id/role',
  requirePermission('users:update_role'),
  validateParams(userIdParamSchema),
  validateBody(updateUserRoleSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const { role } = req.body as z.infer<typeof updateUserRoleSchema>;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    if (!targetUser) {
      throw new AppError(404, 'USER_NOT_FOUND', `User "${id}" not found.`);
    }

    const nextRole = await prisma.role.findUnique({ where: { name: role } });
    if (!nextRole) {
      throw new AppError(400, 'INVALID_ROLE', `Unknown role "${role}".`);
    }

    // Prevent removing the last remaining active Admin account
    if (targetUser.role.name === 'Admin' && role !== 'Admin') {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          id: { not: targetUser.id },
          status: 'Active',
          role: { name: 'Admin' },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new AppError(
          400,
          'LAST_ADMIN_PROTECTED',
          'Cannot downgrade the sole remaining active Admin account.'
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { roleId: nextRole.id },
      include: { role: true },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Updated User Role',
      target: `${updated.email}: ${targetUser.role.name} -> ${updated.role.name}`,
      status: 'Success',
      alwaysRecord: true,
    });

    sendSuccess(res, { user: toUserSummary(updated) });
  })
);

export default router;

