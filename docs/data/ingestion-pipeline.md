# CORTEX 10-Stage Enterprise Data Ingestion Pipeline

The Python ingestion pipeline (`cortex_intelligence.pipeline`) converts raw multi-source inputs into a schema-validated, provenance-annotated Neo4j Knowledge Graph with zero silent failures and repeatable execution.

## Pipeline Stage Architecture (`pipeline/runner.py`)

```
[1] Discovery ──► [2] Validation ──► [3] Schema & Dictionary ──► [4] Profiling
                                                                      │
[8] Graph Bundle ◄── [7] Entity/Rel Extraction ◄── [6] Leakage Split ◄┴── [5] Cleaning & PII Removal
        │
        ▼
[9] Quality Reports & Registry Update ──► [10] Neo4j Constraints + UNWIND/MERGE + Integrity Audit
```

### Stage Breakdown

1. **Source Discovery (`pipeline/discovery.py`):** Locates primary DataCo CSV (`full` mode) or `data/samples/dataco_sample.csv` (`sample` mode), companion variable dictionary, `mock-data.json`, and documentation markdown inputs.
2. **Integrity & Format Validation (`pipeline/validation.py`):** Verifies file non-emptiness, computes streaming SHA-256 checksum (enforcing exact hash match on full DataCo runs), rejects binary null-byte files, detects `utf-8-sig`/`utf-8`/`cp1252`/`latin-1` encoding, validates presence of all `34` required columns, and cross-checks headers against `DescriptionDataCoSupplyChain.csv`.
3. **Schema Reconciliation:** Records undocumented CSV fields (`Order Zipcode`, `shipping date (DateOrders)`) and schema width (`53` cols vs. `52` documented variables).
4. **Statistical Profiling (`pipeline/profiling.py`):** Computes row/column counts, per-column nulls, all-null columns (`Product Description`), trailing/repeated whitespace anomaly counts (`21,604` across dataset), distinct entity cardinalities, `Order Status` / `Delivery Status` distributions, and Tukey IQR quantiles (`Q1`, `Median`, `Q3`, fences) on `Order Profit Per Order`.
5. **Cleaning & PII Exclusion (`pipeline/cleaning.py`):** Strips leading/trailing whitespace and collapses internal multi-spaces; normalizes dates to ISO-8601; validates numeric bounds (`product_price > 0`, `quantity > 0`, `0 <= discount_rate <= 1`, `days >= 0`, `Late_delivery_risk in {0,1}`); deduplicates strictly on unique `Order Item Id`; drops `15` PII/excluded columns; preserves negative-profit orders while flagging IQR outliers (`isProfitOutlier`).
6. **ML-Leakage Separation:** Segregates post-outcome fulfillment attributes (`evalRealShippingDays`, `evalDeliveryStatus`, `evalLateDeliveryRisk`, `evalShippingDate`) from pre-shipment features.
7. **Unstructured Interface (`pipeline/unstructured.py`) & Demonstration Adapter (`adapters/mock_cortex.py`):** Chunks local markdown/text documents deterministically with SHA-256 chunk hashes (providing `LLMExtractionInterface` hook for Phase D2 without calling an LLM in D1), and isolates `mock-data.json` nodes/edges as `DemoEntity` (`demo:*`).
8. **Canonical Extraction & Synthetic Augmentation (`pipeline/extraction.py`, `generators/synthetic_procurement.py`):** Deduplicates dimension hierarchies (`Department`, `ProductCategory`, `Product`, `Region`, `CustomerSegment`), aggregates `65,752` `Order` + `Shipment` nodes while keeping all `180,519` line-item `CONTAINS` edges, and invokes fixed-seed (`20261112`) synthetic procurement generation.
9. **Reporting & Registry Persistence:** Persists `data/processed/reports/data_quality_summary.json`, `data/processed/jobs/<job_id>.json`, and updates `data/registry/dataset_registry.json`.
10. **Neo4j Load & Verification (`graph/ingestor.py`):** Ensures all `14` uniqueness constraints and `9` domain indexes (`23` total Neo4j indexes including constraint-backed range indexes), executes chunked (`batch_size=5000`) idempotent `UNWIND ... MERGE` upserts, and runs `validate_graph_integrity()`.

