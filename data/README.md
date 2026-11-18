# CORTEX Data Workspace (`data/`)

This directory organizes raw acquired open datasets, cleaned/generated artifacts, dataset sample fixtures, and formal provenance registries for **CORTEX Phase D1 (Enterprise Data Acquisition, Ingestion & Knowledge Graph Foundation)**.

## Directory Structure

| Directory | Git Tracked | Purpose |
| :--- | :--- | :--- |
| `data/raw/` | Excluded via `.gitignore` | Cryptographically verified external raw datasets (e.g., `data/raw/dataco/DataCoSupplyChainDataset.csv`, `DescriptionDataCoSupplyChain.csv`). Populated via `python -m cortex_intelligence.cli acquire`. |
| `data/samples/` | Committed | Lightweight sanitized CSV fixture (`dataco_sample.csv`, 30 rows across 5 departments and 4 delivery statuses, PII replaced with placeholder tokens) enabling deterministic `pytest` execution without the 95.9 MB raw archive. |
| `data/processed/` | Excluded via `.gitignore` | Machine-generated outputs from ingestion runs: `reports/data_quality_summary.json`, `reports/graph_statistics.json`, `jobs/<job_id>.json`, and `synthetic_procurement/` exports + `manifest.json`. |
| `data/registry/` | Tracked (`dataset_registry.json` + attribution docs) | Machine-readable provenance metadata catalog (`dataset_registry.json`) and licensing/citation notice (`SOURCE_ATTRIBUTION.md`). |

## Origin Separation Policy

Every ingested entity and relationship is labeled with a mandatory `dataOrigin` field and an isolated `entityId` prefix:

1. `public_open_dataset` (`dataco:*`) — Verified DataCo Smart Supply Chain records (`180,519` line items across `65,752` orders, `118` products, `51` categories, `11` departments, `23` regions, `3` customer segments).
2. `synthetic` (`syn:*`) — Fixed-seed (`SYNTHETIC_RANDOM_SEED=20261112`) procurement/warehouse/inventory/PO-delay extension anchored to real DataCo products and regions (`18` suppliers, `8` warehouses, `236` inventory slots, `120` purchase orders).
3. `demonstration` (`demo:*`, `doc:*`) — Legacy Phase A-C UI mock entities from `mock-data.json` and chunked markdown metadata. Strictly segregated from analytical queries.
4. `external_research` — Evaluated Supply Chain Data Hub candidate datasets (`evaluated_excluded_optional` in `dataset_registry.json`, not loaded into core Neo4j).

## Reproducible Commands

```bash
# 1. Start Neo4j Community Edition
npm run neo4j:up

# 2. Download and SHA-256 verify DataCo open dataset into data/raw/dataco/
cd intelligence && .venv/bin/python -m cortex_intelligence.cli acquire

# 3. Run full 10-stage ingestion pipeline into Neo4j
npm run intelligence:ingest

# 4. Run full automated Python verification suite (uses data/samples/dataco_sample.csv)
npm run intelligence:test
```

