# CORTEX — Phase D2 Completion Report: GraphRAG Intelligence

**Date:** 2026-11-12  
**Project:** CORTEX – Enterprise Decision Intelligence Platform  
**Phase:** D2 — Document Ingestion, Embeddings, Hybrid Retrieval, Multi-Hop Neo4j Traversal & Grounded Q&A  
**Status:** **COMPLETE (Verified)**

---

## 1. Executive Summary

Phase D2 implements an end-to-end **GraphRAG (Graph + Retrieval-Augmented Generation)** subsystem on top of the validated Phase D1 Neo4j Knowledge Graph and FastAPI intelligence service, exposed to the Node.js/Express backend via RBAC-protected proxy routes.

All Phase D2 capabilities operate strictly additively on the Phase D1 graph (`validate_graph_integrity()` remains `integrity_passed: true`, zero Phase D1 records modified, zero cross-origin `demonstration` leakage edges), and all **15 automated Python tests** (`15 passed` in `12.56s`), **frontend TypeScript check** (`npm run lint`), and **backend TypeScript lint/build** (`npm run server:lint`, `npm run server:build`) passed cleanly after the final code edit.

---

## 2. Implemented Architecture & Modules

### 2.1 Python FastAPI GraphRAG Package (`intelligence/src/cortex_intelligence/graphrag/`)

| Module | Responsibility |
| :--- | :--- |
| `models.py` | Pydantic models for extraction results, chunks, embeddings, entity links (`MENTIONS`), retrieval/query requests (`GraphRAGRetrieveRequest`, `GraphRAGQueryRequest`), citations (`CitationRecord`), multi-hop paths (`GraphPathRecord`), temporal filters (`TemporalFilterSummary`), origin-separated evidence, and grounded answers (`GraphRAGAnswerResponse`). |
| `extractor.py` | Multi-format document text extraction supporting `.pdf` (via `pypdf==7.0.1`), `.txt`, `.md`, `.csv`, `.json`, plus `build_text_pdf_bytes()` utility for programmatic PDF generation/testing. |
| `chunker.py` | Boundary-aware document chunker producing deterministic `DocumentChunk` IDs (`<doc_id>:chunk:<idx>`), section/page provenance, character offsets, token counts, and SHA-256 checksums (`chunk_size=900`, `chunk_overlap=150`). |
| `embeddings.py` | `LocalSemanticEmbeddingProvider` (`cortex-local-semantic-512-v1`, 512-dimensional unit-L2 normalized semantic/subword vectors) plus configurable `GeminiEmbeddingProvider` hook. |
| `entity_linker.py` | Word-boundary and alias matcher linking `DocumentChunk` nodes to Neo4j `CortexEntity` nodes via `MENTIONS` edges with `confidence`, `matchType`, `matchedText`, `evidenceExcerpt`, and strict bidirectional `demonstration` isolation. |
| `vector_store.py` | Neo4j `5.26.33` schema & index manager (`cortex_chunk_embedding_idx` VECTOR index, `cortex_chunk_fulltext_idx` FULLTEXT index, `cortex_entity_fulltext_idx` FULLTEXT index, RANGE/UNIQUE constraints), idempotent chunk/link upserts, Cypher vector (`min_score=0.62`) & Lucene fulltext search, document/chunk inspection queries, and `in_memory_hybrid_chunk_search` helper. |
| `retriever.py` | Hybrid multi-channel retriever combining vector similarity, Lucene fulltext search, and graph-mention lookup via Reciprocal Rank Fusion (`fuse_chunk_candidates_rrf`), substantive query-token relevance gating (`_chunk_passes_relevance_gate` and filtered entity anchors), 4-to-6-hop Neo4j supply-chain traversal, and temporal guardrails (`scenario_aware`, `strict_active`, `historical_all`). |
| `answerer.py` | Deterministic grounded synthesis (`synthesize_grounded_answer`) separating `synthetic` simulation scenarios, `public_open_dataset` historical benchmarks, `enterprise_document` policies, and optional `demonstration` context, attaching `[C1..Ck]` and `[G1..Gm]` citations and returning `insufficient_evidence=true` with zero fabricated citations when no relevant evidence passes retrieval gates. |
| `service.py` | Orchestration layer (`ingest_document_request`, `ingest_uploaded_document_bytes`, `retrieve_graphrag_evidence`, `answer_graphrag_question`). |

### 2.2 Schema, Config, CLI, API & Express RBAC Proxy Updates

- **Configuration & Provenance:**
  - `intelligence/src/cortex_intelligence/models/canonical.py`: Added `DataOrigin.ENTERPRISE_DOCUMENT = "enterprise_document"`.
  - `intelligence/src/cortex_intelligence/config.py`: Added `gemini_api_key`, `graphrag_embedding_provider` (`"local"`), `graphrag_embedding_model` (`"cortex-local-semantic-512-v1"`), `graphrag_embedding_dimensions` (`512`), `graphrag_chunk_size` (`900`), `graphrag_chunk_overlap` (`150`), `documents_dir`, and `graphrag_dir`.
  - `intelligence/src/cortex_intelligence/graph/schema.py`: Registered `"DocumentChunk"` in `ENTITY_LABELS`.
- **FastAPI Endpoints (`intelligence/src/cortex_intelligence/api/routes/graphrag.py`, registered in `api/main.py`):**
  - `POST /api/v1/graphrag/documents/ingest`
  - `POST /api/v1/graphrag/documents/upload` (multipart file upload using `python-multipart==0.0.33`)
  - `GET /api/v1/graphrag/documents`
  - `GET /api/v1/graphrag/documents/{document_id}`
  - `GET /api/v1/graphrag/chunks`
  - `POST /api/v1/graphrag/retrieve`
  - `POST /api/v1/graphrag/query`
- **CLI Subcommands (`intelligence/src/cortex_intelligence/cli.py`):**
  - `ingest-docs` and `query-graphrag`
- **Express Backend RBAC Proxy (`server/src/routes/intelligence.routes.ts`):**
  - `POST /api/intelligence/graphrag/documents/ingest` (`datasets:write`, Zod validated, writes `AuditLog` entry `"Ingested GraphRAG Document"`)
  - `GET /api/intelligence/graphrag/documents` (`datasets:read`)
  - `GET /api/intelligence/graphrag/documents/:documentId` (`datasets:read`)
  - `GET /api/intelligence/graphrag/chunks` (`datasets:read`)
  - `POST /api/intelligence/graphrag/retrieve` (`datasets:read`, Zod validated)
  - `POST /api/intelligence/graphrag/query` (`datasets:read`, Zod validated)

---

## 3. Live Neo4j Knowledge Graph & Document Store Verification

Verified directly against running `cortex-neo4j` (Neo4j Community `5.26.33`) after all edits:

- **Graph Totals:** `132,166` nodes (`132,110` Phase D1 nodes + `3` newly ingested `Document` nodes + `53` `DocumentChunk` nodes), `379,361` relationships.
- **GraphRAG Document Corpus (`5` documents, `53` chunks, `68` `:MENTIONS` edges, `0` orphan chunks):**

| Document `entityId` | Format | `dataOrigin` | Chunks (`CONTAINS_CHUNK`) | Linked Entities |
| :--- | :--- | :--- | :--- | :--- |
| `doc:CORTEX_Supplier_Delay_SOP.txt` | `txt` | `enterprise_document` | 3 | 20 |
| `doc:CORTEX_DataCo_Baseline_and_Temporal_Governance.md` | `md` | `enterprise_document` | 3 | 3 |
| `doc:CORTEX_Synthetic_Procurement_Brief.pdf` | `pdf` (2 pages) | `synthetic` | 3 | 21 |
| `doc:README.md` | `md` | `demonstration` | 3 | 0 |
| `doc:UG_PROJECT_FIRST_REVIEW_PRESENTATION.md` | `md` | `demonstration` | 41 | 4 |

- **Online Neo4j GraphRAG Indexes (`SHOW INDEXES`):**
  - `cortex_chunk_embedding_idx` — `VECTOR` (`ONLINE`, `DocumentChunk.embedding`, 512 dims, cosine)
  - `cortex_chunk_fulltext_idx` — `FULLTEXT` (`ONLINE`, `DocumentChunk.{text, sectionTitle, documentTitle}`)
  - `cortex_entity_fulltext_idx` — `FULLTEXT` (`ONLINE`)
  - `cortex_chunk_date_idx`, `cortex_chunk_doc_id_idx`, `cortex_chunk_origin_idx` — `RANGE` (`ONLINE`)
  - `cortex_document_entity_id_unique`, `cortex_documentchunk_entity_id_unique` — uniqueness constraints (`ONLINE`)
- **Phase D1 Integrity & Data Isolation (`validate_graph_integrity()`):**
  - `integrity_passed`: `true`
  - `missing_provenance_nodes`: `0`
  - `missing_provenance_relationships`: `0`
  - `duplicate_entity_ids`: `0`
  - `purchase_orders_without_warehouse`: `0`
  - `demo_cross_edges`: `0` (strict zero cross-origin linkage between `demonstration` and operational/synthetic/enterprise entities)
  - `central_use_case_foundation` (`syn:supplier:SYN-SUP-001`): `12` dependent products, `8` holding warehouses, `24` shortage inventory slots, `15` delayed POs, `56,345` historical customer orders/shipments (`$32,576,680.04` sales, `$3,504,567.57` profit).

---

## 4. Live Grounded Q&A & Temporal Filter Verification

Verified live using `answer_graphrag_question` (default `temporal_mode="scenario_aware"`, `as_of_date="2026-11-12"`, `include_demonstration=false`):

### Query 1 — Multi-Hop Supplier Exposure (`SYN-SUP-001`)
> *"Which purchase orders, warehouses, inventory shortages, and historical DataCo orders are linked to supplier SYN-SUP-001?"*
- `insufficient_evidence`: `false` (`grounded_claims_count: 14`, `citations_count: 12`, `graph_paths_count: 8`)
- **Synthetic Exposure:** `15` delayed POs out of `20` total POs, `4` delayed-PO destination warehouses out of `8` holding warehouses, `12` directly affected shortage inventory slots out of `24` network shortage slots, `12` supplied SKUs.
- **Temporal Guardrail:** `overlapping_window_orders_count: 0`, `current_real_world_orders_count: 0`, `historical_orders_excluded_from_active_count: 56345` (`2015-01-01..2017-10-02` strictly labeled historical benchmark only).

### Query 2 — Window-Overlapping vs. Current Active Orders (`SYN-SUP-018`)
> *"What is the supplier delay impact for SYN-SUP-018, and are any DataCo customer orders currently active as of 2026-11-12?"*
- `insufficient_evidence`: `false` (`grounded_claims_count: 10`, `citations_count: 8`, `graph_paths_count: 2`)
- **Synthetic Exposure:** `2` delayed POs out of `6` total POs (`SYN-PO-0080`, `SYN-PO-0097`), `2` destination warehouses out of `8` holding warehouses, `2` directly affected shortage slots, `6` supplied SKUs.
- **Temporal Guardrail:** Explicitly reports `0` currently active real-world orders as of `2026-11-12`, while separately reporting `610` historical DataCo orders overlapping `[2018-01-05..2018-02-06]` and excluding `1,141` pre-scenario historical orders from causal delay impact.

### Query 3 — Out-of-Scope Hallucination Rejection
> *"What is the Bitcoin spot price forecast for Q4 2027?"*
- `insufficient_evidence`: `true` (`grounded_claims_count: 0`, `citations_count: 0`, `graph_paths_count: 0`)
- Response cleanly refuses to fabricate facts and directs the user to ingest relevant sources or specify valid catalog/procurement identifiers.

---

## 5. Automated Test & Build Results

All checks below ran cleanly after the final code edit:

- **Python Test Suite (`cd intelligence && .venv/bin/pytest -v`):**
  - **Result:** `15 passed, 32 warnings in 12.56s` (`0` failed, `0` skipped)
  - Includes `5` GraphRAG unit tests in `intelligence/tests/test_graphrag_pipeline.py` (multi-format extraction + invalid binary rejection, stable chunk IDs & boundary offsets, embedding determinism/L2-norm/ranking, entity linking confidence + bidirectional demonstration isolation, RRF fusion + insufficient-evidence guard) and `1` end-to-end live Neo4j & FastAPI integration test in `intelligence/tests/test_graphrag_neo4j_and_api.py` (live PDF upload & ingest, hybrid retrieval, multi-hop supplier traversal, temporal filtering on `SYN-SUP-001` & `SYN-SUP-018`, RBAC/service-key auth, demonstration isolation, and citation verification), alongside all `9` Phase D1 / FastAPI tests.
- **TypeScript & Build Verification:**
  - `npm run lint` (`tsc --noEmit`): **Passed (exit code `0`)**
  - `npm run server:lint` (`tsc -p tsconfig.json --noEmit`): **Passed (exit code `0`)**
  - `npm run server:build` (`tsc -p tsconfig.json`): **Passed (exit code `0`)**

---

## 6. Known Limitations & Deferred Scope

1. **Embedding Model Configuration:** `.env` currently holds a 17-character placeholder `GEMINI_API_KEY` that returns HTTP `400` from the Gemini API; Phase D2 therefore runs deterministically on `LocalSemanticEmbeddingProvider` (`cortex-local-semantic-512-v1`, 512 dimensions). Replacing the key and setting `graphrag_embedding_provider="gemini"` activates `GeminiEmbeddingProvider` without schema changes (only re-indexing vectors matching the chosen dimensions).
2. **Deterministic NLG Synthesis:** `answerer.py` synthesizes structured Markdown reports deterministically from retrieved evidence rather than calling an external generative LLM, prioritizing strict zero-hallucination citation fidelity over free-form conversational paraphrasing.
3. **Multipart Upload Proxy Scope:** Raw multipart binary upload (`POST /api/v1/graphrag/documents/upload`) is served directly on FastAPI, whereas the Express proxy exposes JSON ingestion (`POST /api/intelligence/graphrag/documents/ingest`) and all read/retrieve/query endpoints without adding multipart disk buffering (`multer`) to the Node layer.
4. **Phase D3 Deferred Work:** LangGraph multi-agent orchestration, demand/delay forecasting models, Monte Carlo simulation, executable decision dossiers, and new frontend UI panels for GraphRAG interaction are intentionally left out of scope for Phase D3.

