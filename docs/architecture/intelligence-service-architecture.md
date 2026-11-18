# CORTEX Intelligence Service Architecture (`intelligence/`)

## 1. System Position Within Locked 4-Tier Architecture

CORTEX preserves strict separation of concerns across four runtime layers introduced through Phases A–D1:

```
┌───────────────────────────┐     HTTP / Cookie JWT      ┌───────────────────────────────────┐
│   React + Vite Frontend   │ ─────────────────────────► │   Express Application Backend     │
│   (Port 5173 dev / build) │                            │   server/ (Node/TS, Port 4000)    │
└───────────────────────────┘                            │   - PostgreSQL + Prisma ORM       │
                                                         │   - JWT Session Auth & RBAC       │
                                                         │   - /api/intelligence/* Proxy     │
                                                         └─────────────────┬─────────────────┘
                                                                           │ X-Cortex-Service-Key
                                                                           ▼
┌───────────────────────────┐     Bolt Protocol (:7687)  ┌───────────────────────────────────┐
│   Neo4j 5 Community KG    │ ◄───────────────────────── │   Python FastAPI Intelligence     │
│   cortex-neo4j (Docker)   │                            │   intelligence/ (Port 8001)       │
└───────────────────────────┘                            │   - Acquisition & 10-Stage ETL    │
                                                         │   - Fixed-Seed Procurement Gen    │
                                                         │   - Graph Read & Validation API   │
                                                         └───────────────────────────────────┘
```

### Architectural Boundaries (Phase D1)
- **Frontend Unchanged:** React clients communicate solely with Express (`server/`). No browser code connects directly to FastAPI or Neo4j.
- **Express Application Backend Preserved:** Phase C PostgreSQL models (`User`, `Role`, `Permission`, `AuditLog`, `Scenario`, `Recommendation`, `DatasetSource`, etc.), authentication cookies, and RBAC rules remain untouched. `server/src/routes/intelligence.routes.ts` adds a JWT-authenticated RBAC proxy under `/api/intelligence/*`:
  - Read endpoints (`datasets:read`): `/health`, `/sources`, `/ingestion/jobs/:jobId`, `/graph/statistics`, `/graph/entities/:entityId`, `/graph/relationships/:entityId`.
  - Write endpoint (`datasets:write`): `POST /ingestion/structured` (records an `AuditLog` entry upon execution).
- **Internal Service Isolation:** FastAPI (`intelligence/`) listens on `127.0.0.1:8001` (avoiding external port `8000` conflict) and authenticates every `/api/v1/*` route via constant-time `hmac.compare_digest` on `X-Cortex-Service-Key`.
- **No Unconstrained Query Execution:** FastAPI intentionally does **not** expose any raw Cypher execution endpoint (`POST /api/v1/graph/cypher` returns `404`). All Neo4j reads use strictly parameterized queries in `graph/queries.py`.

---

## 2. Package Layout (`intelligence/src/cortex_intelligence/`)

| Module | Responsibility |
| :--- | :--- |
| `config.py` | Pydantic settings loading `.env` (`NEO4J_*`, `INTELLIGENCE_*`, `SYNTHETIC_RANDOM_SEED`), directory initialization (`raw`, `processed`, `registry`, `samples`, `jobs`, `reports`). |
| `models/canonical.py` | Pydantic v2 domain models with mandatory `ProvenanceFields` (`source_dataset`, `source_record_id`, `data_origin`, `ingestion_job_id`), `CleaningStats`, `ExtractedGraphBundle`, and `IngestionJobRecord`. |
| `acquisition/` | Mendeley Data downloader (`dataco.py`), SHA-256 verification, and persistent registry builder (`registry.py`). |
| `pipeline/` | 10-stage ingestion modules: `discovery.py`, `validation.py`, `profiling.py`, `cleaning.py`, `unstructured.py`, `extraction.py`, and orchestrator `runner.py`. |
| `generators/synthetic_procurement.py` | Deterministic `random.Random(seed)` procurement generator anchored to DataCo `Product` & `Region` keys, exporting CSVs + SHA-256 `manifest.json`. |
| `adapters/mock_cortex.py` | Isolates `mock-data.json` nodes/edges under `data_origin="demonstration"` and `demo:*` IDs. |
| `graph/` | Schema constraints/indexes (`schema.py`), Neo4j driver wrapper (`neo4j_client.py`), batch `UNWIND`/`MERGE` upserter + integrity auditor (`ingestor.py`), and parameterized read APIs (`queries.py`). |
| `api/` | FastAPI app factory (`main.py`), internal service-key dependency (`dependencies.py`), and routers (`health.py`, `ingestion.py`, `graph.py`). |
| `cli.py` | Click-free `argparse` CLI (`cortex-ingest acquire`, `cortex-ingest ingest --mode full|sample`). |

---

## 3. FastAPI Endpoints (Phase D1 Scope)

| Method & Path | Auth | Description |
| :--- | :--- | :--- |
| `GET /health` | Public | Reports service status, configured `SYNTHETIC_RANDOM_SEED`, and live Neo4j connectivity check. |
| `POST /api/v1/ingestion/structured` | `X-Cortex-Service-Key` | Executes 10-stage pipeline (`mode="full"` or `"sample"`), writes reports/job JSON, and runs idempotent Neo4j load unless `skip_neo4j=true`. Restricts `source_csv` strictly inside `data_dir`. |
| `GET /api/v1/ingestion/jobs/{job_id}` | `X-Cortex-Service-Key` | Returns persisted `IngestionJobRecord` JSON (path-traversal guarded). |
| `GET /api/v1/ingestion/sources` | `X-Cortex-Service-Key` | Returns all entries from `data/registry/dataset_registry.json`. |
| `GET /api/v1/graph/statistics` | `X-Cortex-Service-Key` | Live Neo4j counts by node label, relationship type, `dataOrigin`, constraints, and indexes. |
| `GET /api/v1/graph/entities/{entity_id}` | `X-Cortex-Service-Key` | Retrieves properties, labels, provenance block, and degree counts for one entity (`404` if absent). |
| `GET /api/v1/graph/relationships/{entity_id}` | `X-Cortex-Service-Key` | Retrieves bounded (`limit=1..200`) outgoing/incoming/both relationships for an entity. |

*(Phase D2/D3 agentic workflows, LangGraph orchestration, Gemini LLM synthesis, predictive ML models, and Monte Carlo engines are explicitly deferred to subsequent phases.)*

