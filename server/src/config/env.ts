import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

// Load root .env first, then allow server/.env overrides if present
dotenv.config({ path: path.resolve(projectRoot, '.env') });
dotenv.config({ path: path.resolve(projectRoot, 'server/.env') });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGINS: z
    .string()
    .default(
      'http://localhost:3000,http://localhost:5173,http://localhost:4173,http://127.0.0.1:3000,http://127.0.0.1:5173,http://127.0.0.1:4173'
    ),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BOOTSTRAP_ADMIN_NAME: z.string().min(1).default('Platform Administrator'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email('BOOTSTRAP_ADMIN_EMAIL must be a valid email'),
  BOOTSTRAP_ADMIN_PASSWORD: z
    .string()
    .min(8, 'BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters'),
  SEED_DEFAULT_USER_PASSWORD: z
    .string()
    .min(8, 'SEED_DEFAULT_USER_PASSWORD must be at least 8 characters')
    .optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid backend environment configuration: ${details}`);
}

export const env = {
  ...parsed.data,
  corsOriginsList: parsed.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
