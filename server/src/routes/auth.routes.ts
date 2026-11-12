import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { validateBody } from '../middleware/validate.js';
import { recordAuditLog } from '../utils/audit.js';
import {
  ACCESS_COOKIE_NAME,
  getAccessCookieOptions,
  getRefreshCookieOptions,
  hashToken,
  REFRESH_COOKIE_NAME,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

const loginSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
  email: z.string().trim().email('Valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

const refreshBodySchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .optional()
  .default({});

function toSafeUserResponse(user: {
  id: string;
  name: string;
  email: string;
  status: string;
  lastActiveLabel: string;
  role: {
    name: string;
    permissions: { permission: { key: string } }[];
  };
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role.name,
    status: user.status,
    lastActive: user.lastActiveLabel,
    permissions: user.role.permissions.map((rp) => rp.permission.key),
  };
}

async function issueSessionCookies(
  res: Parameters<typeof sendSuccess>[0],
  userId: string,
  email: string,
  roleName: string
): Promise<void> {
  const accessToken = signAccessToken({ sub: userId, email, role: roleName });
  const { token: refreshToken, expiresAt } = signRefreshToken(userId);

  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId,
      expiresAt,
    },
  });

  res.cookie(ACCESS_COOKIE_NAME, accessToken, getAccessCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());
}

function clearSessionCookies(res: Parameters<typeof sendSuccess>[0]): void {
  res.clearCookie(ACCESS_COOKIE_NAME, { path: '/' });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/auth' });
}

router.post(
  '/login',
  authRateLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email.toLowerCase();
    const password: string = req.body.password;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    if (user.status === 'Suspended') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account has been suspended.');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'Active',
        lastLoginAt: new Date(),
        lastActiveLabel: 'Active now',
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    await issueSessionCookies(res, updated.id, updated.email, updated.role.name);

    await recordAuditLog({
      actorUserId: updated.id,
      userName: updated.name,
      action: 'Authenticated User Login',
      target: `${updated.email} (${updated.role.name})`,
      status: 'Success',
      alwaysRecord: true,
    });

    sendSuccess(res, { user: toSafeUserResponse(updated) });
  })
);

router.post(
  '/register',
  authRateLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const name: string = req.body.name;
    const email = req.body.email.toLowerCase();
    const password: string = req.body.password;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists.');
    }

    // Public self-registration always assigns least-privilege Viewer role server-side
    const viewerRole = await prisma.role.findUnique({ where: { name: 'Viewer' } });
    if (!viewerRole) {
      throw new AppError(500, 'ROLE_MISSING', 'Default Viewer role is not configured.');
    }

    const passwordHash = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        roleId: viewerRole.id,
        status: 'Active',
        lastLoginAt: new Date(),
        lastActiveLabel: 'Active now',
      },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    await issueSessionCookies(res, created.id, created.email, created.role.name);

    await recordAuditLog({
      actorUserId: created.id,
      userName: created.name,
      action: 'User Self-Registered',
      target: `${created.email} (Viewer)`,
      status: 'Success',
      alwaysRecord: true,
    });

    sendSuccess(res, { user: toSafeUserResponse(created) }, 201);
  })
);

router.post(
  '/refresh',
  authRateLimiter,
  validateBody(refreshBodySchema),
  asyncHandler(async (req, res) => {
    const rawRefresh =
      (typeof req.cookies?.[REFRESH_COOKIE_NAME] === 'string' &&
        req.cookies[REFRESH_COOKIE_NAME]) ||
      req.body?.refreshToken;

    if (!rawRefresh) {
      clearSessionCookies(res);
      throw new AppError(401, 'REFRESH_TOKEN_MISSING', 'Refresh token is missing.');
    }

    let decoded: ReturnType<typeof verifyRefreshToken>;
    try {
      decoded = verifyRefreshToken(rawRefresh);
    } catch {
      clearSessionCookies(res);
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired.');
    }

    const tokenHash = hashToken(rawRefresh);
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (
      !storedToken ||
      storedToken.revokedAt !== null ||
      storedToken.expiresAt <= new Date() ||
      storedToken.userId !== decoded.sub
    ) {
      clearSessionCookies(res);
      throw new AppError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh session is expired or revoked.');
    }

    if (storedToken.user.status === 'Suspended') {
      clearSessionCookies(res);
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Account has been suspended.');
    }

    const { token: newRefreshToken, expiresAt } = signRefreshToken(storedToken.user.id);
    const accessToken = signAccessToken({
      sub: storedToken.user.id,
      email: storedToken.user.email,
      role: storedToken.user.role.name,
    });

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: hashToken(newRefreshToken),
          userId: storedToken.user.id,
          expiresAt,
        },
      }),
    ]);

    res.cookie(ACCESS_COOKIE_NAME, accessToken, getAccessCookieOptions());
    res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, getRefreshCookieOptions());

    sendSuccess(res, { user: toSafeUserResponse(storedToken.user) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const rawRefresh = req.cookies?.[REFRESH_COOKIE_NAME];
    if (typeof rawRefresh === 'string' && rawRefresh.trim()) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(rawRefresh), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const rawAccess = req.cookies?.[ACCESS_COOKIE_NAME];
    if (typeof rawAccess === 'string' && rawAccess.trim()) {
      try {
        const decoded = verifyAccessToken(rawAccess);
        const actor = await prisma.user.findUnique({ where: { id: decoded.sub } });
        if (actor) {
          await recordAuditLog({
            actorUserId: actor.id,
            userName: actor.name,
            action: 'User Signed Out',
            target: actor.email,
            status: 'Success',
            alwaysRecord: true,
          });
        }
      } catch {
        // Ignore expired access token during logout
      }
    }

    clearSessionCookies(res);
    sendSuccess(res, { loggedOut: true });
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    sendSuccess(res, { user: req.user! });
  })
);

export default router;

