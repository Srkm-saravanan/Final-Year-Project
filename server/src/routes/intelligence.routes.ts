import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import { requirePermission } from '../middleware/rbac.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { recordAuditLog } from '../utils/audit.js';
import { sendSuccess } from '../utils/response.js';

const router = Router();

router.use(authenticate);

const entityIdParamSchema = z.object({
  entityId: z.string().trim().min(1).max(200),
});

const jobIdParamSchema = z.object({
  jobId: z.string().trim().min(1).max(120),
});

const triggerIngestionSchema = z.object({
  mode: z.enum(['full', 'sample']).default('sample'),
  source_csv: z.string().trim().max(300).optional(),
  skip_neo4j: z.boolean().default(false),
  include_demonstration: z.boolean().default(true),
  include_synthetic: z.boolean().default(true),
  batch_size: z.number().int().min(100).max(20000).default(5000),
});

async function proxyToIntelligence<T>(
  path: string,
  init?: RequestInit
): Promise<{ status: number; data: T }> {
  const url = `${env.INTELLIGENCE_SERVICE_URL.replace(/\/+$/, '')}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (env.INTELLIGENCE_API_KEY) {
    headers['X-Cortex-Service-Key'] = env.INTELLIGENCE_API_KEY;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch {
    throw new AppError(
      503,
      'INTELLIGENCE_SERVICE_UNAVAILABLE',
      'Python Intelligence Service is currently unreachable.'
    );
  }

  const body = (await response.json().catch(() => null)) as {
    success?: boolean;
    data?: T;
    error?: { code?: string; message?: string };
  } | null;

  if (!response.ok || !body?.success) {
    throw new AppError(
      response.status >= 400 ? response.status : 502,
      body?.error?.code || 'INTELLIGENCE_SERVICE_ERROR',
      body?.error?.message || `Intelligence service request failed (${response.status}).`
    );
  }

  return { status: response.status, data: body.data as T };
}

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const result = await proxyToIntelligence('/health');
    sendSuccess(res, result.data);
  })
);

router.get(
  '/sources',
  requirePermission('datasets:read'),
  asyncHandler(async (_req, res) => {
    const result = await proxyToIntelligence('/api/v1/ingestion/sources');
    sendSuccess(res, result.data);
  })
);

router.post(
  '/ingestion/structured',
  requirePermission('datasets:write'),
  validateBody(triggerIngestionSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/ingestion/structured', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });

    await recordAuditLog({
      actorUserId: req.user?.id,
      userName: req.user?.name ?? 'System',
      action: 'Triggered Structured Graph Ingestion',
      target: `Mode=${String((req.body as { mode?: string }).mode || 'sample')}`,
      status: 'Success',
    });

    sendSuccess(res, result.data, 201);
  })
);

router.get(
  '/ingestion/jobs/:jobId',
  requirePermission('datasets:read'),
  validateParams(jobIdParamSchema),
  asyncHandler(async (req, res) => {
    const jobId = encodeURIComponent(req.params.jobId!);
    const result = await proxyToIntelligence(`/api/v1/ingestion/jobs/${jobId}`);
    sendSuccess(res, result.data);
  })
);

router.get(
  '/graph/statistics',
  requirePermission('datasets:read'),
  asyncHandler(async (_req, res) => {
    const result = await proxyToIntelligence('/api/v1/graph/statistics');
    sendSuccess(res, result.data);
  })
);

router.get(
  '/graph/entities/:entityId',
  requirePermission('datasets:read'),
  validateParams(entityIdParamSchema),
  asyncHandler(async (req, res) => {
    const entityId = encodeURIComponent(req.params.entityId!);
    const result = await proxyToIntelligence(`/api/v1/graph/entities/${entityId}`);
    sendSuccess(res, result.data);
  })
);

router.get(
  '/graph/relationships/:entityId',
  requirePermission('datasets:read'),
  validateParams(entityIdParamSchema),
  asyncHandler(async (req, res) => {
    const entityId = encodeURIComponent(req.params.entityId!);
    const qs = new URLSearchParams();
    if (typeof req.query.limit === 'string') qs.set('limit', req.query.limit);
    if (typeof req.query.direction === 'string') qs.set('direction', req.query.direction);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const result = await proxyToIntelligence(`/api/v1/graph/relationships/${entityId}${suffix}`);
    sendSuccess(res, result.data);
  })
);

const graphragIngestSchema = z.object({
  file_path: z.string().trim().max(400).optional(),
  text: z.string().max(2_000_000).optional(),
  filename: z.string().trim().max(200).optional(),
  title: z.string().trim().max(300).optional(),
  doc_type: z.string().trim().max(50).optional(),
  document_id: z.string().trim().max(150).optional(),
  document_date: z.string().trim().max(40).optional(),
  data_origin: z
    .enum(['public_open_dataset', 'synthetic', 'demonstration', 'external_research', 'enterprise_document'])
    .default('enterprise_document'),
  chunk_size: z.number().int().min(200).max(4000).optional(),
  chunk_overlap: z.number().int().min(0).max(1000).optional(),
});

const graphragRetrieveSchema = z.object({
  query: z.string().trim().min(2).max(2000),
  top_k: z.number().int().min(1).max(25).default(6),
  max_hops: z.number().int().min(1).max(6).default(4),
  include_demonstration: z.boolean().default(false),
  temporal_mode: z.enum(['scenario_aware', 'strict_active', 'historical_all']).default('scenario_aware'),
  as_of_date: z.string().trim().max(40).default('2026-11-12'),
  order_start_date: z.string().trim().max(40).optional(),
  order_end_date: z.string().trim().max(40).optional(),
  data_origins: z.array(z.string().trim()).optional(),
});

const graphragQuerySchema = graphragRetrieveSchema.extend({
  include_retrieval_debug: z.boolean().default(true),
});

const documentIdParamSchema = z.object({
  documentId: z.string().trim().min(1).max(200),
});

router.post(
  '/graphrag/documents/ingest',
  requirePermission('datasets:write'),
  validateBody(graphragIngestSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/graphrag/documents/ingest', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });

    await recordAuditLog({
      actorUserId: req.user?.id,
      userName: req.user?.name ?? 'System',
      action: 'Ingested GraphRAG Document',
      target: String(
        (req.body as { title?: string; file_path?: string; filename?: string }).title ||
          (req.body as { file_path?: string }).file_path ||
          (req.body as { filename?: string }).filename ||
          'Inline Document'
      ),
      status: 'Success',
    });

    sendSuccess(res, result.data, 201);
  })
);

router.get(
  '/graphrag/documents',
  requirePermission('datasets:read'),
  asyncHandler(async (req, res) => {
    const qs = new URLSearchParams();
    if (typeof req.query.data_origin === 'string') qs.set('data_origin', req.query.data_origin);
    if (typeof req.query.limit === 'string') qs.set('limit', req.query.limit);
    if (typeof req.query.offset === 'string') qs.set('offset', req.query.offset);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const result = await proxyToIntelligence(`/api/v1/graphrag/documents${suffix}`);
    sendSuccess(res, result.data);
  })
);

router.get(
  '/graphrag/documents/:documentId',
  requirePermission('datasets:read'),
  validateParams(documentIdParamSchema),
  asyncHandler(async (req, res) => {
    const documentId = encodeURIComponent(req.params.documentId!);
    const qs = new URLSearchParams();
    if (typeof req.query.limit === 'string') qs.set('limit', req.query.limit);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const result = await proxyToIntelligence(`/api/v1/graphrag/documents/${documentId}${suffix}`);
    sendSuccess(res, result.data);
  })
);

router.get(
  '/graphrag/chunks',
  requirePermission('datasets:read'),
  asyncHandler(async (req, res) => {
    const qs = new URLSearchParams();
    if (typeof req.query.document_id === 'string') qs.set('document_id', req.query.document_id);
    if (typeof req.query.entity_id === 'string') qs.set('entity_id', req.query.entity_id);
    if (typeof req.query.data_origin === 'string') qs.set('data_origin', req.query.data_origin);
    if (typeof req.query.limit === 'string') qs.set('limit', req.query.limit);
    if (typeof req.query.offset === 'string') qs.set('offset', req.query.offset);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const result = await proxyToIntelligence(`/api/v1/graphrag/chunks${suffix}`);
    sendSuccess(res, result.data);
  })
);

router.post(
  '/graphrag/retrieve',
  requirePermission('datasets:read'),
  validateBody(graphragRetrieveSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/graphrag/retrieve', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    sendSuccess(res, result.data);
  })
);

router.post(
  '/graphrag/query',
  requirePermission('datasets:read'),
  validateBody(graphragQuerySchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/graphrag/query', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    sendSuccess(res, result.data);
  })
);

const llmChatSchema = z.object({
  prompt: z.string().trim().min(1).max(10000),
  system_prompt: z.string().trim().max(10000).optional(),
  temperature: z.number().min(0).max(1).optional(),
});

const llmStructuredSchema = z.object({
  query: z.string().trim().min(1).max(10000),
  system_instruction: z.string().trim().max(10000).optional(),
  temperature: z.number().min(0).max(1).optional(),
});

router.get(
  '/llm/connectivity',
  requirePermission('datasets:read'),
  asyncHandler(async (_req, res) => {
    const result = await proxyToIntelligence('/api/v1/llm/connectivity');
    sendSuccess(res, result.data);
  })
);

router.post(
  '/llm/chat',
  requirePermission('datasets:read'),
  validateBody(llmChatSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/llm/chat', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    sendSuccess(res, result.data);
  })
);

router.post(
  '/llm/generate-structured',
  requirePermission('datasets:read'),
  validateBody(llmStructuredSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/llm/generate-structured', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    sendSuccess(res, result.data);
  })
);

const deliberateSchema = z.object({
  query: z.string().trim().min(2).max(2000),
  as_of_date: z.string().trim().max(40).default('2026-11-12'),
  include_demonstration: z.boolean().default(false),
  temporal_mode: z.enum(['scenario_aware', 'strict_active', 'historical_all']).default('scenario_aware'),
  top_k: z.number().int().min(1).max(20).default(6),
});

const sessionIdParamSchema = z.object({
  sessionId: z.string().trim().min(1).max(100),
});

router.get(
  '/agents/manifest',
  requirePermission('datasets:read'),
  asyncHandler(async (_req, res) => {
    const result = await proxyToIntelligence('/api/v1/agents/manifest');
    sendSuccess(res, result.data);
  })
);

router.post(
  '/agents/deliberate',
  requirePermission('datasets:read'),
  validateBody(deliberateSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/agents/deliberate', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });

    await recordAuditLog({
      actorUserId: req.user?.id,
      userName: req.user?.name ?? 'System',
      action: 'Triggered Multi-Agent Deliberation',
      target: String((req.body as { query?: string }).query?.slice(0, 50) || 'Deliberation'),
      status: 'Success',
    });

    sendSuccess(res, result.data);
  })
);

router.get(
  '/agents/deliberations/:sessionId',
  requirePermission('datasets:read'),
  validateParams(sessionIdParamSchema),
  asyncHandler(async (req, res) => {
    const sessionId = encodeURIComponent(req.params.sessionId!);
    const result = await proxyToIntelligence(`/api/v1/agents/deliberations/${sessionId}`);
    sendSuccess(res, result.data);
  })
);

// ----------------------------------------------------------------------
// Phase 3: Predictive Analytics & What-If Simulation Proxy Routes
// ----------------------------------------------------------------------

const predictDeliveryDelaySchema = z.object({
  scheduled_shipping_days: z.number().int().min(0).max(10).default(4),
  shipping_mode: z.string().trim().default('Standard Class'),
  customer_segment: z.string().trim().default('Consumer'),
  market: z.string().trim().default('Pacific Asia'),
  order_region: z.string().trim().default('Southeast Asia'),
  category_name: z.string().trim().default('Cardio Equipment'),
  unit_price: z.number().min(0).default(120),
  quantity: z.number().int().min(1).max(50).default(1),
  discount_rate: z.number().min(0).max(0.5).default(0.05),
  order_hour: z.number().int().min(0).max(23).default(14),
  order_dow: z.number().int().min(0).max(6).default(2),
  order_month: z.number().int().min(1).max(12).default(11),
  order_quarter: z.number().int().min(1).max(4).default(4),
});

const predictStockoutRiskSchema = z.object({
  warehouse_code: z.string().trim().default('SYN-WH-001'),
  market: z.string().trim().default('USCA'),
  capacity_units: z.number().int().default(120000),
  on_hand_units: z.number().int().min(0).default(150),
  safety_stock_units: z.number().int().min(0).default(300),
  reorder_point_units: z.number().int().min(0).default(450),
  is_directly_affected_by_po_delay: z.boolean().default(true),
});

const demandForecastSchema = z.object({
  category_name: z.string().trim().default('All Categories'),
  horizon_days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
});

const simulateScenarioSchema = z.object({
  scenario_name: z.string().trim().min(2).max(200).default('Supplier Disruption & Demand Surge'),
  iterations: z.number().int().min(100).max(50000).default(2000),
  demand_shock_mean: z.number().default(0.15),
  demand_shock_std: z.number().min(0).default(0.08),
  supplier_delay_days_mean: z.number().min(0).default(12.0),
  supplier_delay_days_std: z.number().min(0).default(4.0),
  procurement_cost_inflation_mean: z.number().default(0.05),
  procurement_cost_inflation_std: z.number().min(0).default(0.02),
  baseline_daily_demand: z.number().min(1).default(150.0),
  baseline_inventory_units: z.number().min(0).default(1800.0),
  safety_stock_units: z.number().min(0).default(600.0),
  simulation_horizon_days: z.number().int().min(1).max(180).default(30),
  unit_sale_price_usd: z.number().min(0.1).default(120.0),
  unit_cogs_usd: z.number().min(0.1).default(65.0),
  holding_cost_per_unit_day: z.number().min(0).default(0.10),
  stockout_penalty_per_unit: z.number().min(0).default(35.0),
  expedited_freight_cost_usd: z.number().min(0).default(0.0),
  expedited_lead_time_reduction_days: z.number().min(0).default(0.0),
});

router.post(
  '/predictive/delivery-delay',
  requirePermission('datasets:read'),
  validateBody(predictDeliveryDelaySchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/predictive/delivery-delay', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    sendSuccess(res, result.data);
  })
);

router.post(
  '/predictive/stockout-risk',
  requirePermission('datasets:read'),
  validateBody(predictStockoutRiskSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/predictive/stockout-risk', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    sendSuccess(res, result.data);
  })
);

router.post(
  '/predictive/demand-forecast',
  requirePermission('datasets:read'),
  validateBody(demandForecastSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/predictive/demand-forecast', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });
    sendSuccess(res, result.data);
  })
);

router.post(
  '/predictive/simulate-scenario',
  requirePermission('datasets:read'),
  validateBody(simulateScenarioSchema),
  asyncHandler(async (req, res) => {
    const result = await proxyToIntelligence('/api/v1/predictive/simulate-scenario', {
      method: 'POST',
      body: JSON.stringify(req.body),
    });

    await recordAuditLog({
      actorUserId: req.user?.id,
      userName: req.user?.name ?? 'System',
      action: 'Executed Monte Carlo Scenario Simulation',
      target: String((req.body as { scenario_name?: string }).scenario_name || 'Simulation'),
      status: 'Success',
    });

    sendSuccess(res, result.data);
  })
);

router.get(
  '/predictive/models/manifest',
  requirePermission('datasets:read'),
  asyncHandler(async (_req, res) => {
    const result = await proxyToIntelligence('/api/v1/predictive/models/manifest');
    sendSuccess(res, result.data);
  })
);

export default router;
