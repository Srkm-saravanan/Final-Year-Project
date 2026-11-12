# CORTEX Enterprise Decision Intelligence Platform — Phase C Completion Report

**Project:** CORTEX – Enterprise Decision Intelligence Platform  
**Scope:** Phase C Only — Backend, Database, Authentication & API Integration  
**Status:** **COMPLETE**  
**Date:** 2026-11-12  

---

## 1. Summary of Phase C Deliverables

Phase C transitions CORTEX from a browser-only Phase B frontend into a full-stack web application backed by **Node.js**, **Express**, **TypeScript (`strict: true`)**, **PostgreSQL**, **Prisma ORM**, **Zod**, **bcryptjs**, and **HTTP-only JWT authentication with RBAC**.

All business data (users, roles/permissions, enterprise data sources, uploaded CSV dataset batches, sales records, scenarios, recommendations, audit logs, system settings, dashboard metrics/trends, AI agents, knowledge graph nodes/edges, and slides) now originates from and persists in PostgreSQL, replacing volatile browser `localStorage` business-data storage while leaving Phase D/E AI/ML engines untouched as scoped.

---

## 2. Backend Architecture (`server/`)

The backend lives in `server/` with its own isolated TypeScript project (`server/tsconfig.json`) and dependency tree (`server/package.json`).

### Directory Layout
- `server/src/config/env.ts` — Validates environment configuration with Zod at startup (`DATABASE_URL`, `PORT`, `CORS_ORIGINS`, `COOKIE_SECURE`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `SEED_DEFAULT_USER_PASSWORD`).
- `server/src/db/prisma.ts` — Shared `PrismaClient` instance.
- `server/src/app.ts` — Express application factory wiring `trust proxy`, `helmet` (`crossOriginResourcePolicy: 'cross-origin'`), strict allowlist `cors({ credentials: true })`, `cookie-parser`, `express.json({ limit: '5mb' })`, route mounts under `/api/*`, `notFoundHandler`, and `errorHandler`.
- `server/src/index.ts` — HTTP bootstrap verifying DB readiness and listening on `PORT` (default `4000`).
- `server/src/middleware/`
  - `auth.ts` — Extracts `cortex_access_token` cookie (or `Authorization: Bearer ...`), verifies JWT, checks active user & DB role/permissions, attaches `req.authUser`, rejects missing/expired/invalid tokens with `401`.
  - `rbac.ts` — `requirePermission(...)` and `requireRole(...)` middleware enforcing server-side `403 FORBIDDEN`.
  - `validate.ts` — `validateBody`, `validateParams`, `validateQuery` using Zod schemas (`400 VALIDATION_ERROR`).
  - `rateLimit.ts` — `authRateLimiter` (60 requests per 15 minutes on `/api/auth/*`, returning `429 RATE_LIMIT_EXCEEDED`).
  - `errorHandler.ts` — `AppError`, `asyncHandler`, `notFoundHandler`, and centralized `errorHandler` returning standardized `{ success: false, error: { code, message, details? } }`.
- `server/src/utils/`
  - `password.ts` — `bcryptjs` hashing and constant-time comparison (`hashPassword`, `verifyPassword`).
  - `jwt.ts` — Access/refresh token signing, verification, and refresh token SHA-256 hashing for DB storage.
  - `response.ts` — Standardized `sendSuccess(res, data, status)` JSON envelope.
  - `audit.ts` — `recordAuditLog(...)` helper persisting immutable governance events into PostgreSQL.
  - `simulationMath.ts` — Server-side deterministic parametric simulation matching frontend baseline/delta calculations and supporting negative EBITDA results (no hardcoded floor).
- `server/src/routes/`
  - `health.routes.ts` (`/api/health`)
  - `auth.routes.ts` (`/api/auth/*`)
  - `dashboard.routes.ts` (`/api/dashboard/*`)
  - `dataset.routes.ts` (`/api/datasets/*`)
  - `scenario.routes.ts` (`/api/scenarios/*`)
  - `recommendation.routes.ts` (`/api/recommendations/*`)
  - `governance.routes.ts` (`/api/audit-logs`, `/api/settings`, `/api/agents/:id`)
  - `user.routes.ts` (`/api/users/*`)

---

## 3. PostgreSQL & Prisma Database Schema

Defined in [schema.prisma](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/server/prisma/schema.prisma) with initial migration [migration.sql](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/server/prisma/migrations/20261112141056_init_cortex_schema/migration.sql).

### Normalized Models Implemented
- **Identity & RBAC:** `Role`, `Permission`, `RolePermission`, `User` (stores `passwordHash`, never plaintext), `RefreshToken` (`tokenHash`, `expiresAt`, `revokedAt`).
- **Enterprise Data & Datasets:** `DataSource` (cascades to `DatasetRecord`), `SalesRecord`, `DatasetRecord` (stores uploaded CSV rows with JSON payloads and schema metadata).
- **Executive Intelligence & Analytics:** `DashboardMetric`, `ExecutiveInsight`, `TopOpportunity`, `KeyRisk`, `RecentRecommendation`, `TrendRecord`, `ForecastPoint`, `ForecastDriver`, `PresentationSlide`.
- **Workspace & Graph:** `AiAgent`, `ChatSession` (cascades to `ChatMessage`), `ChatMessage`, `KnowledgeGraphNode`, `KnowledgeGraphEdge`.
- **Decisions & Governance:** `SavedScenario`, `Recommendation`, `AuditLog`, `SystemSetting`.

---

## 4. Seed Data Architecture & Repeatability

[seed.ts](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/server/prisma/seed.ts) imports [mock-data.json](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/mock-data.json) and seeds PostgreSQL idempotently using `upsert` and deterministic IDs:
- Creates the 4 canonical RBAC roles (`Admin`, `Executive`, `Analyst`, `Viewer`) and 15 fine-grained permissions.
- Provisions an environment-configured bootstrap Admin (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`) alongside the seeded enterprise users (`p.sharma@cortex-enterprise.ai` as `Admin`, `sriramark2005@gmail.com` & `m.vance@cortex-enterprise.ai` as `Executive`, `aditi.r@cortex-enterprise.ai` as `Analyst`, and `viewer@cortex-enterprise.ai` as `Viewer`) using `bcryptjs` password hashes (`$2b$...`).
- **Repeatability verified:** Running `npm --prefix server run prisma:seed` twice back-to-back produced identical baseline row counts (`roles=4`, `permissions=15`, `users=6`, `data_sources=7`, `sales_records=12`, `ai_agents=5`, `chat_sessions=5`, `chat_messages=10`, `kg_nodes=16`, `kg_edges=16`, `saved_scenarios=2`, `recommendations=5`, `slides=16`).

---

## 5. Authentication & Session Security

- **Password Storage:** All user passwords hashed via `bcryptjs` (`passwordHash` never serialized in API responses).
- **HTTP-Only JWT Cookies:**
  - `cortex_access_token` (`httpOnly: true`, `sameSite: 'lax'`, `path: '/'`).
  - `cortex_refresh_token` (`httpOnly: true`, `sameSite: 'lax'`, `path: '/api/auth'`).
- **Refresh Rotation & Revocation:** `POST /api/auth/refresh` validates the stored refresh token hash in PostgreSQL, revokes the consumed token, and issues a rotated access + refresh pair. Replaying an already-rotated or logged-out refresh token returns `401`.
- **Self-Registration Least Privilege:** `POST /api/auth/register` always creates accounts with the `Viewer` role regardless of any client-supplied role field.
- **Single-Flight Client Retry:** [apiClient.ts](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/services/apiClient.ts) deduplicates concurrent `401` token refreshes and clears client auth state if refresh fails, returning the user cleanly to [AuthGate.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/components/AuthGate.tsx).

---

## 6. RBAC Permission Matrix

| Permission Key | Admin | Executive | Analyst | Viewer |
|---|---|---|---|---|
| `dashboard:read`, `datasets:read`, `scenarios:read`, `recommendations:read`, `settings:read` | Yes | Yes | Yes | Yes |
| `datasets:write` | Yes | No | Yes | No |
| `scenarios:write`, `scenarios:delete` | Yes | Yes | Yes | No |
| `recommendations:update_status` | Yes | Yes | No | No |
| `audit:read` | Yes | Yes | No | No |
| `settings:write`, `users:read`, `users:create`, `users:update_role`, `agents:write` | Yes | No | No | No |

- **Server Enforcement:** Every protected route checks JWT authentication (`401`) and RBAC permissions (`403`) in middleware.
- **Client UI Guards:** Navigation (`Sidebar.tsx`, `CommandPalette.tsx`), action buttons (`ScenarioSimulator.tsx`, `RecommendationsView.tsx`, `DataExplorer.tsx`, `AdminSettings.tsx`), and the `/settings` view route in [App.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/App.tsx) enforce role/permission visibility and render a `403 · Administrative Access Required` guard for non-Admin roles. Signing out or losing authentication resets navigation back to `overview` and closes open modals.

---

## 7. REST API Endpoints Reference

| Method | Path | Auth & Permission | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | DB connectivity probe (`{ status: 'ok', database: 'connected' }`) |
| `POST` | `/api/auth/login` | Public (Rate-limited) | Validate email/password, issue HTTP-only JWT cookies |
| `POST` | `/api/auth/register` | Public (Rate-limited) | Self-register least-privilege `Viewer` account |
| `POST` | `/api/auth/refresh` | Refresh Cookie (Rate-limited) | Rotate refresh token and issue fresh JWT cookies |
| `POST` | `/api/auth/logout` | Optional Cookie | Revoke refresh token in DB and clear auth cookies |
| `GET` | `/api/auth/me` | Authenticated | Return current `AuthUser` profile, role, and permissions |
| `GET` | `/api/dashboard/overview` | `authenticate` | Hydrate metrics, insights, opportunities, risks, forecasts, graph, agents, chats, slides |
| `GET` | `/api/dashboard/trends` | `authenticate` | Return monthly & quarterly revenue/profit trend series |
| `GET` | `/api/datasets` | `datasets:read` | List all enterprise data sources and sales records |
| `GET` | `/api/datasets/:id` | `datasets:read` | Inspect dataset metadata and persisted `DatasetRecord` rows |
| `POST` | `/api/datasets` | `datasets:write` | Create a dataset/CSV batch source with initial parsed rows |
| `POST` | `/api/datasets/:id/records` | `datasets:write` | Append CSV/dataset rows to an existing `DataSource` |
| `GET` | `/api/scenarios` | `scenarios:read` | List saved strategic scenarios |
| `GET` | `/api/scenarios/:id` | `scenarios:read` | Fetch single scenario details |
| `POST` | `/api/scenarios` | `scenarios:write` | Create and simulate scenario in PostgreSQL |
| `PUT` | `/api/scenarios/:id` | `scenarios:write` | Update scenario parameters and recalculated KPIs |
| `DELETE` | `/api/scenarios/:id` | `scenarios:delete` | Delete saved scenario |
| `GET` | `/api/recommendations` | `recommendations:read` | List all strategic recommendations |
| `PATCH` | `/api/recommendations/:id/status` | `recommendations:update_status` | Approve, reject, or move recommendation status |
| `GET` | `/api/audit-logs` | `audit:read` | Fetch governance audit trail ordered newest-first |
| `GET` | `/api/settings` | `settings:read` | Read global failover & audit archival settings |
| `PUT` | `/api/settings` | `settings:write` | Update global system settings |
| `PATCH` | `/api/agents/:id` | `agents:write` | Update persisted AI agent configuration |
| `GET` | `/api/users` | `users:read` | List platform users and assigned roles |
| `POST` | `/api/users` | `users:create` | Provision/invite user with hashed password & assigned role |
| `PATCH` | `/api/users/:id/role` | `users:update_role` | Update user RBAC role |

---

## 8. Vite Proxy & Full-Stack Integration

[vite.config.ts](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/vite.config.ts) proxies `/api/*` in both `server` (dev port `3000`) and `preview` (port `4173`) to `VITE_API_PROXY_TARGET || http://localhost:4000`, enabling first-party same-origin HTTP-only cookie transmission between the SPA and Express API. Root [package.json](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/package.json) adds convenience scripts (`server:dev`, `server:build`, `server:start`, `server:lint`, `db:generate`, `db:migrate`, `db:seed`).

---

## 9. Frontend Service Layer & Context Architecture

- Created [apiClient.ts](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/services/apiClient.ts) and [cortexApi.ts](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/services/cortexApi.ts) (`authApi`, `dashboardApi`, `datasetApi`, `scenarioApi`, `recommendationApi`, `governanceApi`, `userApi`).
- Added [AuthContext.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/context/AuthContext.tsx) & [AuthGate.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/components/AuthGate.tsx) gating application access behind live session verification (`GET /api/auth/me`).
- Updated [DataFabricContext.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/context/DataFabricContext.tsx), [SimulationContext.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/context/SimulationContext.tsx), [RecommendationsContext.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/context/RecommendationsContext.tsx), [GovernanceContext.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/context/GovernanceContext.tsx), [IntelligenceContext.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/context/IntelligenceContext.tsx), and [CortexContext.tsx](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/context/CortexContext.tsx) to hydrate from and persist mutations to PostgreSQL via `cortexApi`.

---

## 10. Persistence Boundary (`PostgreSQL` vs Browser `localStorage`)

- **PostgreSQL:** Users, roles/permissions, refresh tokens, datasets/CSV uploads, sales records, scenarios, recommendation statuses, system settings, agent configurations, audit logs, dashboard trends/metrics/forecasts/slides, and chat/graph records.
- **Browser `localStorage`:** Stripped down in [storage.ts](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/src/utils/storage.ts) to a single UI preference key `cortex.uiPreferences.v1` storing only `currency` and `displayScale`. Verified zero business-data keys remain in `localStorage`.

---

## 11. Verification Results

### TypeScript & Production Builds
- `npm run lint` (`tsc --noEmit` strict mode): **PASSED (exit 0)**
- `npm run build` (`vite build` -> `dist/`): **PASSED (exit 0)**
- `npm run server:lint` (`tsc -p tsconfig.json --noEmit` strict mode): **PASSED (exit 0)**
- `npm run server:build` (`tsc -p tsconfig.json` -> `server/dist/`): **PASSED (exit 0)**

### Full-Stack End-to-End Verification (`verify_phase_c.mjs`)
Executed against compiled Node/Express backend (`node server/dist/index.js` on port `4000`), live PostgreSQL (`cortex_db`), Vite dev proxy (`:3005`), Vite preview proxy (`:4173`), and Headless Chromium over CDP (`task-910`, exit code 0):
1. **Seed Repeatability & Password Security:** `npm --prefix server run prisma:seed` run twice produced identical entity counts; verified zero non-bcrypt hashes in `"User"`.
2. **Vite Dev & Preview Proxies:** Verified `GET /api/health` returned `{ status: 'ok', database: 'connected' }` via both Vite dev (`:3005/api/health`) and preview (`:4173/api/health`) proxies.
3. **Auth & Session Security:** Verified `401` for unauthenticated and tampered JWT requests; `HttpOnly` cookie flags on login/register; self-registration enforces `Viewer` even when `role: 'Admin'` is sent; refresh token rotation (`200` once, `401` on replay); logout revocation.
4. **RBAC Enforcement (`403`):** Verified `Viewer` gets `403` on `GET /api/users`, `POST /api/scenarios`, and `PATCH /api/recommendations/rec-1/status`; `Analyst` gets `403` on recommendation approval and `GET /api/audit-logs`; `Executive` gets `403` on `GET /api/users`.
5. **Chromium UI E2E & Restart Persistence:**
   - Unauthenticated visitor gated by `AuthGate` without dashboard exposure.
   - Signed in as `Admin` (`Platform Administrator`); verified Executive Overview KPI hydration from PostgreSQL (`₹ 124.3 Cr`, `Profit Margin`).
   - Uploaded CSV batch (`phase_c_supply.csv` -> `phase c supply`, 3 records) in Data Explorer, saved custom scenario (`E2E Phase C Expansion`) in Scenario Simulator, approved a recommendation, and opened `ReportModal`.
   - **Killed and restarted backend process (`server/dist/index.js`) + reloaded Chromium page (`ignoreCache: true`)**: verified session continuity, uploaded CSV dataset persisted in PostgreSQL, saved scenario persisted in PostgreSQL, then deleted scenario cleanly.
   - Verified `AdminSettings` (`Users & RBAC`, `System Settings`, `Audit Trail` + Web Crypto `Verify SHA-256 Chain` badge).
   - Verified `window.localStorage` contained only `cortex.uiPreferences.v1`.
   - Signed out, logged back in as `Viewer` (`Kiran Nair`), verified `Settings & Admin` nav is hidden and mutation controls on Recommendations are disabled/read-only, with **zero console errors or HTTP 5xx responses**.

---

## 12. Out-of-Scope Items (Reserved for Phase D / Phase E)

Per Phase C boundaries, the following were intentionally left unimplemented:
- Live Google Gemini API calls (`@google/genai`) and multi-agent ReAct reasoning loops (`sendMessage` continues local simulated multi-agent consensus persistence).
- Live GraphRAG document chunking, triplet extraction, vector embeddings, or Neo4j graph traversal.
- ML time-series forecasting engine and Monte Carlo simulation backend.
- Automated Vitest / Playwright CI suites and Docker/Cloud Run container packaging.

---

## 13. Key Files Added / Modified

- **Root Config & Docs:** `.env.example`, `package.json`, `vite.config.ts`, `PHASE_C_COMPLETION_REPORT.md`, `current_phase_built.md`
- **Backend (`server/`):** `server/package.json`, `server/tsconfig.json`, `server/prisma/schema.prisma`, `server/prisma/migrations/20261112141056_init_cortex_schema/migration.sql`, `server/prisma/seed.ts`, `server/src/app.ts`, `server/src/index.ts`, `server/src/config/env.ts`, `server/src/db/prisma.ts`, `server/src/types/express.d.ts`, `server/src/middleware/*`, `server/src/routes/*`, `server/src/utils/*`
- **Frontend (`src/`):** `src/services/apiClient.ts`, `src/services/cortexApi.ts`, `src/context/AuthContext.tsx`, `src/components/AuthGate.tsx`, `src/utils/storage.ts`, `src/types/cortex.ts`, updated `App.tsx`, `Header.tsx`, `Sidebar.tsx`, `CommandPalette.tsx`, `ReportModal.tsx`, context providers, and view components (`DataExplorer.tsx`, `ScenarioSimulator.tsx`, `RecommendationsView.tsx`, `AdminSettings.tsx`).

---

## 14. Startup & Verification Commands

```bash
# 1. Configure .env from .env.example with local PostgreSQL credentials and JWT secrets
# 2. Generate Prisma client, apply migrations, and seed initial enterprise data
npm run db:generate
npm run db:migrate
npm run db:seed

# 3. Start backend API (port 4000) and frontend Vite dev server (port 3000) in separate terminals
npm run server:dev
npm run dev

# 4. Production build & strict TypeScript checks
npm run lint && npm run build
npm run server:lint && npm run server:build
```

