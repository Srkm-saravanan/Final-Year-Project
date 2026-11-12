import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendError, sendSuccess } from '../utils/response.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      sendSuccess(res, {
        status: 'ok',
        service: 'cortex-backend',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch {
      sendError(res, 503, 'DATABASE_UNAVAILABLE', 'PostgreSQL health check failed.');
    }
  })
);

export default router;

