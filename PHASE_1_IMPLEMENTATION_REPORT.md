# CORTEX — Phase 1 Implementation Report: Local LLM Integration

**Date:** 2026-11-17  
**Project:** CORTEX – Enterprise Decision Intelligence Platform  
**Phase:** Phase 1 — Local Ollama LLM Integration (`cortex-qwen:latest`)  
**Status:** **COMPLETE & VERIFIED (22/22 Automated Tests Passing)**

---

## 1. Executive Summary

In accordance with `CORTEX_IMPLEMENTATION_ROADMAP.md`, Phase 1 connects the local Ollama LLM daemon directly into the Python FastAPI intelligence service. The integration pins execution to the local **`cortex-qwen:latest`** model (Qwen2.5-Coder 3B, Q4_K_M, 1.9GB footprint), strictly honoring the hardware constraints of the local **NVIDIA GeForce RTX 2050 (4GB VRAM)**.

All 7 newly developed Ollama client and route tests pass cleanly alongside all 15 existing GraphRAG, pipeline, and Neo4j integrity tests (`22 passed in 24.21s`). Frontend and backend TypeScript builds (`tsc --noEmit`, `server:lint`, `server:build`) compile with zero errors.

---

## 2. Architecture & Design Principles

### 2.1 Hardware-Constrained Execution Profile
* **GPU**: NVIDIA GeForce RTX 2050 (4,096 MiB total VRAM).
* **Model**: `cortex-qwen:latest` (Qwen2.5-Coder 3B, Q4_K_M).
  * VRAM Footprint: ~2,154 MiB VRAM.
  * Inference Throughput: **~42–55 tokens/second** on warm turns.
  * Context Window: Hard-bounded to **4,096 tokens** (`options.num_ctx = 4096`) to prevent KV cache memory runaway.
* **Concurrency Serialization Lock**: An asynchronous lock (`asyncio.Lock()`) serializes all inference calls. Even if multiple API requests arrive simultaneously, they are queued and executed one-at-a-time through the GPU, eliminating the risk of CUDA Out-Of-Memory (OOM) crashes.

### 2.2 Strict Zero-Prose Structured Output Pipeline
1. **Schema Injection**: `build_system_prompt_with_json_schema()` injects Pydantic models' `model_json_schema()` directly into the system turn.
2. **Native JSON Formatting**: Ollama is called with `format="json"`, forcing the model sampler to constrain token transitions to valid JSON tokens.
3. **Fencing & Commentary Stripper**: `clean_json_text()` strips accidental markdown fences (````json ... ````) and conversational preamble/postscript.
4. **Resilient Field Aliasing & Normalization**: Pydantic models utilize `AliasChoices` (e.g. `decision_summary` vs `decisionSummary`) and custom pre-validators (e.g. normalizing percentage `90` or `'High'` into a clamped float `0.90`).
5. **Auto-Retry on Validation Failure**: If schema validation fails, the client automatically appends the validation error message to the conversation context and executes a single self-correction turn before returning an error envelope.

---

## 3. Implemented Modules & File Manifest

### 3.1 Python Intelligence Package (`intelligence/src/cortex_intelligence/llm/`)

| File | Purpose / Responsibilities |
| :--- | :--- |
| `intelligence/src/cortex_intelligence/config.py` | Added `ollama_base_url` (`http://localhost:11434`), `ollama_model` (`cortex-qwen:latest`), `ollama_context_size` (4096), `ollama_temperature` (0.2), `ollama_timeout_seconds` (60.0). |
| `intelligence/src/cortex_intelligence/llm/exceptions.py` | Defined exception hierarchy: `OllamaError`, `OllamaConnectionError`, `OllamaTimeoutError`, `OllamaModelNotFoundError`, `OllamaResponseError`, `OllamaValidationError`. |
| `intelligence/src/cortex_intelligence/llm/models.py` | Pydantic wire models (`ChatMessage`, `ChatRole`, `OllamaModelOptions`, `OllamaChatRequest`, `OllamaChatResponse`, `OllamaConnectivityStatus`, `StructuredGenerationResult[T]`, `DecisionInsightSchema`, `DecisionFactor`). |
| `intelligence/src/cortex_intelligence/llm/prompts.py` | Prompt formatting utilities (`clean_json_text`, `build_system_prompt_with_json_schema`, `DECISION_ANALYST_SYSTEM_PROMPT`, `GOVERNANCE_SYSTEM_PROMPT`). |
| `intelligence/src/cortex_intelligence/llm/client.py` | Async `OllamaClient` using `httpx.AsyncClient`, connection pooling, context management, concurrency serialization lock, latency profiling, and auto-retry structured validation. |
| `intelligence/src/cortex_intelligence/llm/__init__.py` | Package-level exports for clean downstream imports by agents. |

### 3.2 FastAPI Endpoints & Dependencies

| File | Changes |
| :--- | :--- |
| `intelligence/src/cortex_intelligence/api/dependencies.py` | Added `get_ollama_client()` dependency injector pulling `app.state.ollama_client`. |
| `intelligence/src/cortex_intelligence/api/routes/llm.py` | Registered endpoints protected by `X-Cortex-Service-Key`:<br>• `GET /api/v1/llm/connectivity`<br>• `POST /api/v1/llm/chat`<br>• `POST /api/v1/llm/generate-structured` |
| `intelligence/src/cortex_intelligence/api/main.py` | Initialized `OllamaClient` in `create_app()` and added graceful cleanup in `lifespan`. Registered `llm.router`. |

### 3.3 Express Backend Reverse Proxy

| File | Changes |
| :--- | :--- |
| `server/src/routes/intelligence.routes.ts` | Added RBAC-guarded proxy routes (`requirePermission('datasets:read')`):<br>• `GET /api/intelligence/llm/connectivity`<br>• `POST /api/intelligence/llm/chat`<br>• `POST /api/intelligence/llm/generate-structured` |

---

## 4. Live Model Verification & Benchmarks

Live testing against local Ollama `http://localhost:11434` with `cortex-qwen:latest`:

### 4.1 Connectivity Telemetry (`GET /api/v1/llm/connectivity`)
```json
{
  "connected": true,
  "base_url": "http://localhost:11434",
  "target_model": "cortex-qwen:latest",
  "model_available": true,
  "available_models": [
    "cortex-gemma-cpu:latest",
    "cortex-qwen:latest",
    "qwen2.5-coder:3b",
    "gemma4:latest",
    "hf.co/TrevorJS/gemma-4-E2B-it-uncensored-GGUF:Q4_K_M",
    "huihui_ai/deepseek-r1-abliterated:8b"
  ],
  "latency_ms": 3.82,
  "context_limit": 4096,
  "error": null
}
```

### 4.2 Structured Output Generation (`POST /api/v1/llm/generate-structured`)
**Prompt:** *"Evaluate whether to approve an emergency expedited logistics shipment for flagship vendor SYN-SUP-001 experiencing a 14-day delay on purchase order SYN-PO-0004."*

**Validated Pydantic Output:**
```json
{
  "decision_summary": "Approve Emergency Expedited Logistics Shipment",
  "recommendation": "Approve the expedited logistics shipment for SYN-SUP-001 to SYN-PO-0004 as it is a flagship vendor and the 14-day delay is critical for the vendor's operations and customer satisfaction.",
  "confidence": 0.90,
  "key_factors": [
    {"factor_name": "Flagship Vendor Status", "impact_level": "Medium", "description": "Flagship Vendor Status"},
    {"factor_name": "Critical Order Delay", "impact_level": "Medium", "description": "Critical Order Delay"},
    {"factor_name": "Vendor Operations Impact", "impact_level": "Medium", "description": "Vendor Operations Impact"},
    {"factor_name": "Customer Satisfaction", "impact_level": "Medium", "description": "Customer Satisfaction"}
  ],
  "risk_assessment": "The risk of delay in shipment is high due to the 14-day delay, which could impact the vendor's operations and customer satisfaction. However, the approval of the expedited shipment is necessary to ensure timely delivery."
}
```
* **Attempts Required**: 1 (Immediate schema adherence).
* **Generation Throughput**: 63 tokens in 1,220ms (~51.6 tokens/sec).

---

## 5. Automated Test Results

The full test command was executed:
```bash
npm run lint && npm run server:lint && npm run server:build && npm run intelligence:test
```

### Test Suite Execution Summary:
* **Frontend TypeScript (`tsc --noEmit`)**: Passed (exit code 0).
* **Server TypeScript Lint (`server:lint`)**: Passed (exit code 0).
* **Server TypeScript Build (`server:build`)**: Passed (exit code 0).
* **Python Pytest Suite (`intelligence:test`)**: **`22 passed, 32 warnings in 24.21s`**.

```
============================= test session starts ==============================
rootdir: /home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/intelligence
configfile: pyproject.toml
testpaths: tests
plugins: anyio-4.16.0
collected 22 items                                                             

tests/test_acquisition_and_registry.py::test_verify_file_integrity_detects_missing_empty_mismatch_and_valid PASSED [  4%]
tests/test_acquisition_and_registry.py::test_registry_persistence_and_origin_separation PASSED [  9%]
tests/test_fastapi_endpoints.py::test_fastapi_endpoints_auth_ingestion_and_graph_contracts PASSED [ 13%]
tests/test_graphrag_neo4j_and_api.py::test_graphrag_live_ingestion_hybrid_retrieval_multihop_temporal_and_grounding PASSED [ 18%]
tests/test_graphrag_pipeline.py::test_document_extraction_pdf_txt_md_csv_json_and_rejection PASSED [ 22%]
tests/test_graphrag_pipeline.py::test_chunking_stable_ids_clean_boundaries_and_provenance PASSED [ 27%]
tests/test_graphrag_pipeline.py::test_local_semantic_embeddings_norm_determinism_and_ranking PASSED [ 31%]
tests/test_graphrag_pipeline.py::test_entity_linking_confidence_evidence_and_demonstration_isolation PASSED [ 36%]
tests/test_graphrag_pipeline.py::test_in_memory_hybrid_rrf_and_insufficient_evidence_guard PASSED [ 40%]
tests/test_neo4j_ingestion_and_integrity.py::test_neo4j_constraints_idempotent_upsert_and_integrity PASSED [ 45%]
tests/test_ollama_client.py::test_ollama_live_connectivity[asyncio] PASSED [ 50%]
tests/test_ollama_client.py::test_ollama_live_structured_generation[asyncio] PASSED [ 54%]
tests/test_ollama_client.py::test_concurrency_serialization_lock[asyncio] PASSED [ 59%]
tests/test_ollama_client.py::test_schema_validation_retry_and_failure[asyncio] PASSED [ 63%]
tests/test_ollama_client.py::test_timeout_and_connection_error_handling[asyncio] PASSED [ 68%]
tests/test_ollama_client.py::test_clean_json_text_helper PASSED          [ 72%]
tests/test_ollama_client.py::test_fastapi_llm_routes PASSED              [ 77%]
tests/test_pipeline_cleaning_and_extraction.py::test_sample_csv_validation_cleaning_and_ml_leakage_separation PASSED [ 81%]
tests/test_pipeline_cleaning_and_extraction.py::test_cleaning_trims_whitespace_rejects_duplicates_and_bad_numerics PASSED [ 86%]
tests/test_pipeline_cleaning_and_extraction.py::test_sales_full_precision_preserved_without_4dp_drift PASSED [ 90%]
tests/test_pipeline_cleaning_and_extraction.py::test_canonical_extraction_provenance_and_unstructured_chunker PASSED [ 95%]
tests/test_synthetic_procurement.py::test_synthetic_procurement_fixed_seed_deterministic_and_use_case_complete PASSED [100%]
======================= 22 passed, 32 warnings in 24.21s =======================
```

---

## 6. Remaining Issues & Phase 2 Handoff

Phase 1 provides the foundational LLM inference runtime. The following capabilities are explicitly deferred to upcoming phases per the roadmap:
1. **Multi-Agent Orchestration (Phase 2)**: The 5 domain agents (Finance, Operations, Market, Risk, Strategy) are ready to be built on top of `OllamaClient` using sequential state transitions.
2. **Predictive Analytics (Phase 3)**: Time-series forecasting and Monte Carlo simulations will be built in Python and exposed as tools for the agents.
3. **Frontend Wiring (Phase 4)**: React `IntelligenceContext.tsx` will be switched from mock timers to live backend endpoints in Phase 4 once the agent swarm is operational.

