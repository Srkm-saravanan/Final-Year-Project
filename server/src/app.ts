import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { AppError, errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import datasetRoutes from './routes/dataset.routes.js';
import governanceRoutes from './routes/governance.routes.js';
import healthRoutes from './routes/health.routes.js';
import recommendationRoutes from './routes/recommendation.routes.js';
import scenarioRoutes from './routes/scenario.routes.js';
import userRoutes from './routes/user.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Allow server-to-server / CLI / same-origin proxy calls without an Origin header
        if (!origin) {
          callback(null, true);
          return;
        }
        if (env.corsOriginsList.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new AppError(403, 'CORS_FORBIDDEN', `Origin "${origin}" is not allowed by CORS.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '5mb' }));

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/datasets', datasetRoutes);
  app.use('/api/scenarios', scenarioRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api', governanceRoutes);
  app.use('/api/users', userRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

