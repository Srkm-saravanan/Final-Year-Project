import { Prisma } from '@prisma/client';
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

const tabularCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const tabularRowSchema = z.record(z.string(), tabularCellSchema);

const createDatasetSchema = z.object({
  name: z.string().trim().min(1, 'Dataset name is required').max(150),
  type: z
    .enum([
      'ERP',
      'Database',
      'CRM',
      'Supply Chain',
      'HR',
      'Market Research',
      'External Data',
      'Custom',
    ])
    .default('Custom'),
  category: z
    .enum(['Finance', 'Operations', 'Customers', 'Supply Chain', 'HR'])
    .default('Operations'),
  recordsCount: z.string().trim().max(50).optional(),
  fileName: z.string().trim().max(255).optional(),
  columns: z.array(z.string()).max(200).optional(),
  rows: z.array(tabularRowSchema).max(5000).optional(),
});

const salesRecordInputSchema = z.object({
  date: z.string().trim().min(1),
  region: z.enum(['North', 'South', 'East', 'West']),
  product: z.enum(['A', 'B', 'C', 'D']),
  category: z.enum(['Electronics', 'Home', 'Appliances', 'Accessories']),
  quantity: z.number().int().nonnegative(),
  revenue: z.number().nonnegative(),
});

const appendRecordsSchema = z.union([
  z.object({
    kind: z.literal('sales'),
    records: z.array(salesRecordInputSchema).min(1).max(1000),
  }),
  z.object({
    kind: z.literal('tabular'),
    rows: z.array(tabularRowSchema).min(1).max(5000),
  }),
  salesRecordInputSchema,
]);

router.get(
  '/',
  requirePermission('datasets:read'),
  asyncHandler(async (_req, res) => {
    const [sources, salesRecords, datasetRecords] = await Promise.all([
      prisma.dataSource.findMany({
        orderBy: { createdAt: 'asc' },
      }),
      prisma.salesRecord.findMany({
        orderBy: { id: 'asc' },
      }),
      prisma.datasetRecord.findMany({
        orderBy: [{ dataSourceId: 'asc' }, { rowIndex: 'asc' }],
      }),
    ]);

    const customDatasets: Record<
      string,
      {
        sourceId: string;
        fileName: string;
        importedAt: string;
        columns: string[];
        rows: Record<string, unknown>[];
      }
    > = {};

    const rowsBySource = new Map<string, Record<string, unknown>[]>();
    for (const row of datasetRecords) {
      const list = rowsBySource.get(row.dataSourceId) ?? [];
      list.push(row.data as Record<string, unknown>);
      rowsBySource.set(row.dataSourceId, list);
    }

    for (const src of sources) {
      if (src.fileName && src.columns.length > 0) {
        customDatasets[src.id] = {
          sourceId: src.id,
          fileName: src.fileName,
          importedAt: src.lastUpdated,
          columns: src.columns,
          rows: rowsBySource.get(src.id) ?? [],
        };
      }
    }

    sendSuccess(res, {
      dataSources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        status: s.status,
        recordsCount: s.recordsCount,
        lastUpdated: s.lastUpdated,
        category: s.category,
      })),
      salesRecords: salesRecords.map((sr) => ({
        id: sr.id,
        date: sr.date,
        region: sr.region,
        product: sr.product,
        category: sr.category,
        quantity: sr.quantity,
        revenue: sr.revenue,
      })),
      customDatasets,
    });
  })
);

router.get(
  '/:id',
  requirePermission('datasets:read'),
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const source = await prisma.dataSource.findUnique({
      where: { id },
      include: {
        salesRecords: { orderBy: { id: 'asc' } },
        customRows: { orderBy: { rowIndex: 'asc' } },
      },
    });

    if (!source) {
      throw new AppError(404, 'DATASET_NOT_FOUND', `Data source "${id}" not found.`);
    }

    sendSuccess(res, {
      dataSource: {
        id: source.id,
        name: source.name,
        type: source.type,
        status: source.status,
        recordsCount: source.recordsCount,
        lastUpdated: source.lastUpdated,
        category: source.category,
        fileName: source.fileName,
        columns: source.columns,
      },
      salesRecords: source.salesRecords.map((sr) => ({
        id: sr.id,
        date: sr.date,
        region: sr.region,
        product: sr.product,
        category: sr.category,
        quantity: sr.quantity,
        revenue: sr.revenue,
      })),
      rows: source.customRows.map((r) => r.data),
    });
  })
);

router.post(
  '/',
  requirePermission('datasets:write'),
  validateBody(createDatasetSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof createDatasetSchema>;
    const rowCount = body.rows?.length ?? 0;
    const nowLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const recordsCount =
      body.rows !== undefined
        ? rowCount.toLocaleString('en-US')
        : body.recordsCount || '0';

    const created = await prisma.$transaction(async (tx) => {
      const ds = await tx.dataSource.create({
        data: {
          name: body.name,
          type: body.type,
          status: 'Connected • Live',
          recordsCount,
          lastUpdated: body.fileName ? nowLabel : 'Just now',
          category: body.category,
          fileName: body.fileName ?? null,
          columns: body.columns ?? [],
          createdById: req.user!.id,
        },
      });

      if (body.rows && body.rows.length > 0) {
        await tx.datasetRecord.createMany({
          data: body.rows.map((row, idx) => ({
            dataSourceId: ds.id,
            rowIndex: idx,
            data: row as Prisma.InputJsonValue,
          })),
        });
      }

      return ds;
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: body.fileName ? 'Imported CSV Dataset' : 'Connected Data Source',
      target: body.fileName
        ? `${body.fileName} (${rowCount} rows, ${body.columns?.length ?? 0} cols)`
        : created.name,
      status: 'Success',
    });

    sendSuccess(
      res,
      {
        dataSource: {
          id: created.id,
          name: created.name,
          type: created.type,
          status: created.status,
          recordsCount: created.recordsCount,
          lastUpdated: created.lastUpdated,
          category: created.category,
        },
        ...(created.fileName
          ? {
              customDataset: {
                sourceId: created.id,
                fileName: created.fileName,
                importedAt: created.lastUpdated,
                columns: created.columns,
                rows: body.rows ?? [],
              },
            }
          : {}),
      },
      201
    );
  })
);

router.post(
  '/:id/records',
  requirePermission('datasets:write'),
  validateParams(idParamSchema),
  validateBody(appendRecordsSchema),
  asyncHandler(async (req, res) => {
    const id = req.params.id!;
    const source = await prisma.dataSource.findUnique({ where: { id } });
    if (!source) {
      throw new AppError(404, 'DATASET_NOT_FOUND', `Data source "${id}" not found.`);
    }

    const body = req.body as z.infer<typeof appendRecordsSchema>;
    if ('kind' in body && body.kind === 'tabular') {
      const existingMax = await prisma.datasetRecord.aggregate({
        where: { dataSourceId: id },
        _max: { rowIndex: true },
      });
      const startIdx = (existingMax._max.rowIndex ?? -1) + 1;

      await prisma.$transaction([
        prisma.datasetRecord.createMany({
          data: body.rows.map((row, idx) => ({
            dataSourceId: id,
            rowIndex: startIdx + idx,
            data: row as Prisma.InputJsonValue,
          })),
        }),
        prisma.dataSource.update({
          where: { id },
          data: {
            recordsCount: (startIdx + body.rows.length).toLocaleString('en-US'),
            lastUpdated: 'Just now',
          },
        }),
      ]);

      await recordAuditLog({
        actorUserId: req.user!.id,
        userName: req.user!.name,
        action: 'Appended Dataset Records',
        target: `${source.name} (+${body.rows.length} rows)`,
        status: 'Success',
      });

      sendSuccess(res, { appended: body.rows.length, kind: 'tabular' }, 201);
      return;
    }

    const salesItems = 'kind' in body ? body.records : [body];
    const createdSales = await prisma.$transaction(async (tx) => {
      const inserted = [];
      for (const item of salesItems) {
        const rec = await tx.salesRecord.create({
          data: {
            dataSourceId: id,
            date: item.date,
            region: item.region,
            product: item.product,
            category: item.category,
            quantity: item.quantity,
            revenue: item.revenue,
          },
        });
        inserted.push(rec);
      }

      const totalCount = await tx.salesRecord.count({ where: { dataSourceId: id } });
      await tx.dataSource.update({
        where: { id },
        data: {
          recordsCount: totalCount.toLocaleString('en-US'),
          lastUpdated: 'Just now',
        },
      });
      return inserted;
    });

    await recordAuditLog({
      actorUserId: req.user!.id,
      userName: req.user!.name,
      action: 'Appended Sales Records',
      target: `${source.name} (+${createdSales.length} rows)`,
      status: 'Success',
    });

    sendSuccess(
      res,
      {
        appended: createdSales.length,
        records: createdSales.map((sr) => ({
          id: sr.id,
          date: sr.date,
          region: sr.region,
          product: sr.product,
          category: sr.category,
          quantity: sr.quantity,
          revenue: sr.revenue,
        })),
      },
      201
    );
  })
);

export default router;

