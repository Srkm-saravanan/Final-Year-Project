import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { recordAuditLog } from '../utils/audit.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate);

const updateSettingsSchema = z
  .object({
    automatedModelFailover: z.boolean().optional(),
    auditTrailArchival: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.automatedModelFailover !== undefined || data.auditTrailArchival !== undefined,
    { message: 'At least one setting field must be provided' }
  );

const agentIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

const updateAgentSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  temperature: z.number().min(0).max(1).optional(),
  systemPrompt: z.string().trim().min(1).max(4000).optional(),
  status: z.enum(['Idle', 'Analyzing...', 'Complete', 'Evaluating...']).optional(),
});

router.get(
  '/audit-logs',
  requirePermission('audit:read'),
  asyncHandler(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 250,
    });

    sendSuccess(res, {
      auditLogs: logs.map((l) => ({
        id: l.id,
        timestamp: l.timestampLabel,
        user: l.userName,
        action: l.action,
        target: l.target,
        status: l.status,
      })),
    });
  })
);

router.get(
  '/settings',
  requirePermission('settings:read'),
  asyncHandler(async (_req, res) => {
    const settings = await prisma.systemSetting.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        automatedModelFailover: true,
        auditTrailArchival: true,
      },
      update: {},
    });

    sendSuccess(res, {
      settings: {
        automatedModelFailover: settings.automatedModelFailover,
        auditTrailArchival: settings.auditTrailArchival,
      },
    });
  })
);

router.put(
  '/settings',
  requirePermission('settings:write'),
  validateBody(updateSettingsSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof updateSettingsSchema>;

    const current = await prisma.systemSetting.upsert({
      where: { id: 'global' },
      create: {
        id: 'global',
        automatedModelFailover: true,
        auditTrailArchival: true,
      },
      update: {},
    });

    const nextFailover =
      body.automatedModelFailover !== undefined
        ? body.automatedModelFailover
        : current.automatedModelFailover;
    const nextArchival =
      body.auditTrailArchival !== undefined
        ? body.auditTrailArchival
        : current.auditTrailArchival;

    const updated = await prisma.systemSetting.update({
      where: { id: 'global' },
      data: {
        automatedModelFailover: nextFailover,
        auditTrailArchival: nextArchival,
        updatedById: req.user!.id,
      },
    });

    const changes: string[] = [];
    if (body.automatedModelFailover !== undefined) {
      changes.push(
        `Automated Model Failover: ${nextFailover ? 'Enabled' : 'Disabled'}`
      );
    }
    if (body.auditTrailArchival !== undefined) {
      changes.push(`Audit Trail Archival: ${nextArchival ? 'Enabled' : 'Disabled'}`);
    }

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Updated System Policy',
      target: changes.join(' | '),
      status: nextArchival ? 'Success' : 'Warning',
      alwaysRecord: true,
    });

    sendSuccess(res, {
      settings: {
        automatedModelFailover: updated.automatedModelFailover,
        auditTrailArchival: updated.auditTrailArchival,
      },
    });
  })
);

router.patch(
  '/agents/:id',
  requirePermission('agents:write'),
  validateParams(agentIdParamSchema),
  validateBody(updateAgentSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const body = req.body as z.infer<typeof updateAgentSchema>;

    const existing = await prisma.aiAgent.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'AGENT_NOT_FOUND', `Agent "${id}" not found.`);
    }

    const updated = await prisma.aiAgent.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.model !== undefined ? { model: body.model } : {}),
        ...(body.temperature !== undefined ? { temperature: body.temperature } : {}),
        ...(body.systemPrompt !== undefined ? { systemPrompt: body.systemPrompt } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Updated Agent Configuration',
      target: `${updated.name} (${updated.id})`,
      status: 'Success',
    });

    sendSuccess(res, {
      agent: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        description: updated.description,
        iconName: updated.iconName,
        model: updated.model,
        temperature: updated.temperature,
        status: updated.status,
        tools: updated.tools,
        systemPrompt: updated.systemPrompt,
      },
    });
  })
);

export default router;

