import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { recordAuditLog } from '../utils/audit.js';
import { sendSuccess } from '../utils/response.js';
import {
  calculateScenarioKpis,
  DEFAULT_BASELINE_KPIS,
  formatScenarioOutlook,
} from '../utils/simulationMath.js';

const router = Router();

router.use(authenticate);

const idParamSchema = z.object({
  id: z.string().trim().min(1),
});

const scenarioParamsSchema = z.object({
  priceChange: z.number().min(-50).max(100),
  marketingBudget: z.number().min(0).max(200),
  productionVolume: z.number().min(-60).max(200),
  staffingLevel: z.enum(['No Change', '+5%', '+10%', '-5%']),
});

const createScenarioSchema = z.object({
  name: z.string().trim().max(160).optional(),
  params: scenarioParamsSchema,
});

const updateScenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    params: scenarioParamsSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.params !== undefined, {
    message: 'At least name or params must be provided',
  });

function formatScenario(row: {
  id: string;
  name: string;
  timestampLabel: string;
  priceChange: number;
  marketingBudget: number;
  productionVolume: number;
  staffingLevel: string;
  kpiRevenue: number;
  kpiProfit: number;
  kpiProfitMargin: number;
  kpiMarketShare: number;
  kpiRoi: number;
  outlook: string;
}) {
  return {
    id: row.id,
    name: row.name,
    timestamp: row.timestampLabel,
    params: {
      priceChange: row.priceChange,
      marketingBudget: row.marketingBudget,
      productionVolume: row.productionVolume,
      staffingLevel: row.staffingLevel,
    },
    kpis: {
      revenue: row.kpiRevenue,
      profit: row.kpiProfit,
      profitMargin: row.kpiProfitMargin,
      marketShare: row.kpiMarketShare,
      roi: row.kpiRoi,
    },
    outlook: row.outlook,
  };
}

router.get(
  '/',
  requirePermission('scenarios:read'),
  asyncHandler(async (_req, res) => {
    const scenarios = await prisma.savedScenario.findMany({
      orderBy: { createdAt: 'desc' },
    });

    sendSuccess(res, {
      scenarios: scenarios.map(formatScenario),
    });
  })
);

router.get(
  '/:id',
  requirePermission('scenarios:read'),
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const scenario = await prisma.savedScenario.findUnique({ where: { id } });
    if (!scenario) {
      throw new AppError(404, 'SCENARIO_NOT_FOUND', `Scenario "${id}" not found.`);
    }
    sendSuccess(res, { scenario: formatScenario(scenario) });
  })
);

router.post(
  '/',
  requirePermission('scenarios:write'),
  validateBody(createScenarioSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createScenarioSchema>;
    const kpis = calculateScenarioKpis(body.params, DEFAULT_BASELINE_KPIS);
    const outlook = formatScenarioOutlook(kpis, DEFAULT_BASELINE_KPIS);

    const fallbackName = `Scenario (${body.params.priceChange > 0 ? '+' : ''}${body.params.priceChange}% Price, ₹${body.params.marketingBudget}Cr Mktg)`;
    const name = body.name && body.name.length > 0 ? body.name : fallbackName;
    const timestampLabel = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const created = await prisma.savedScenario.create({
      data: {
        name,
        timestampLabel,
        priceChange: body.params.priceChange,
        marketingBudget: body.params.marketingBudget,
        productionVolume: body.params.productionVolume,
        staffingLevel: body.params.staffingLevel,
        kpiRevenue: kpis.revenue,
        kpiProfit: kpis.profit,
        kpiProfitMargin: kpis.profitMargin,
        kpiMarketShare: kpis.marketShare,
        kpiRoi: kpis.roi,
        outlook,
        createdById: req.user!.id,
      },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Saved Custom Scenario',
      target: created.name,
      status: 'Success',
    });

    sendSuccess(res, { scenario: formatScenario(created) }, 201);
  })
);

router.put(
  '/:id',
  requirePermission('scenarios:write'),
  validateParams(idParamSchema),
  validateBody(updateScenarioSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const body = req.body as z.infer<typeof updateScenarioSchema>;

    const existing = await prisma.savedScenario.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'SCENARIO_NOT_FOUND', `Scenario "${id}" not found.`);
    }

    const nextParams = body.params ?? {
      priceChange: existing.priceChange,
      marketingBudget: existing.marketingBudget,
      productionVolume: existing.productionVolume,
      staffingLevel: existing.staffingLevel as 'No Change' | '+5%' | '+10%' | '-5%',
    };
    const nextKpis = calculateScenarioKpis(nextParams, DEFAULT_BASELINE_KPIS);
    const nextOutlook = formatScenarioOutlook(nextKpis, DEFAULT_BASELINE_KPIS);

    const updated = await prisma.savedScenario.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        priceChange: nextParams.priceChange,
        marketingBudget: nextParams.marketingBudget,
        productionVolume: nextParams.productionVolume,
        staffingLevel: nextParams.staffingLevel,
        kpiRevenue: nextKpis.revenue,
        kpiProfit: nextKpis.profit,
        kpiProfitMargin: nextKpis.profitMargin,
        kpiMarketShare: nextKpis.marketShare,
        kpiRoi: nextKpis.roi,
        outlook: nextOutlook,
      },
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Updated Saved Scenario',
      target: updated.name,
      status: 'Success',
    });

    sendSuccess(res, { scenario: formatScenario(updated) });
  })
);

router.delete(
  '/:id',
  requirePermission('scenarios:delete'),
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const existing = await prisma.savedScenario.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(404, 'SCENARIO_NOT_FOUND', `Scenario "${id}" not found.`);
    }

    await prisma.savedScenario.delete({ where: { id } });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Deleted Saved Scenario',
      target: existing.name,
      status: 'Warning',
    });

    sendSuccess(res, { deletedId: id });
  })
);

export default router;

