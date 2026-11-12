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

const idParamSchema = z.object({
  id: z.string().trim().min(1),
});

const updateStatusSchema = z.object({
  status: z.enum(['New', 'In Progress', 'Approved', 'Rejected', 'Completed', 'Not Started']),
});

router.get(
  '/',
  requirePermission('recommendations:read'),
  asyncHandler(async (_req, res) => {
    const items = await prisma.recommendation.findMany({
      orderBy: { id: 'asc' },
    });

    sendSuccess(res, {
      recommendations: items.map((rec) => ({
        id: rec.id,
        priority: rec.priority,
        title: rec.title,
        expectedImpact: rec.expectedImpact,
        confidence: rec.confidence,
        category: rec.category,
        status: rec.status,
        timeHorizon: rec.timeHorizon,
        evidence: rec.evidence,
        rationale: rec.rationale,
        risks: rec.risks,
      })),
    });
  })
);

router.patch(
  '/:id/status',
  requirePermission('recommendations:update_status'),
  validateParams(idParamSchema),
  validateBody(updateStatusSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const { status } = req.body as z.infer<typeof updateStatusSchema>;

    const existing = await prisma.recommendation.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'RECOMMENDATION_NOT_FOUND', `Recommendation "${id}" not found.`);
    }

    const updated = await prisma.recommendation.update({
      where: { id },
      data: {
        status,
        updatedById: req.user!.id,
      },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Updated Recommendation Status',
      target: `ID: ${updated.id} -> ${updated.status}`,
      status: updated.status === 'Rejected' ? 'Warning' : 'Success',
    });

    sendSuccess(res, {
      recommendation: {
        id: updated.id,
        priority: updated.priority,
        title: updated.title,
        expectedImpact: updated.expectedImpact,
        confidence: updated.confidence,
        category: updated.category,
        status: updated.status,
        timeHorizon: updated.timeHorizon,
        evidence: updated.evidence,
        rationale: updated.rationale,
        risks: updated.risks,
      },
    });
  })
);

export default router;

