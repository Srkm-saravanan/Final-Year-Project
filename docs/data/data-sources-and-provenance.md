# Data Sources & Provenance Governance (`docs/data/data-sources-and-provenance.md`)

## 1. Provenance Design Principles

CORTEX Phase D1 treats **data origin transparency** as an architectural invariant. Every node (`132,110`) and relationship (`379,120`) persisted in Neo4j carries four immutable provenance attributes:
- `sourceDataset`: Source file or deterministic generator identifier.
- `sourceRecordId`: Line-item, entity, or synthetic record key enabling deterministic `MERGE`.
- `dataOrigin`: Enumerated origin tier (`public_open_dataset`, `synthetic`, `demonstration`, `external_research`).
- `ingestionJobId`: Unique execution identifier (e.g., `job-20261112-152958-61667c66`) tracing back to `data/processed/jobs/<job_id>.json`.

Verified integrity counts across both full ingestion runs:
- `missing_provenance_nodes`: `0`
- `missing_provenance_relationships`: `0`
- `duplicate_entity_ids`: `0`

---

## 2. Dataset Distribution in Live Neo4j Graph

| `dataOrigin` | Namespace Prefix | Node Count | Share | Source |
| :--- | :--- | :---: | :---: | :--- |
| `public_open_dataset` | `dataco:*` | `131,710` | `99.70%` | `DataCoSupplyChainDataset.csv` (`180,519` line items -> `65,752` Orders, `65,752` Shipments, `118` Products, `51` Categories, `23` Regions, `11` Departments, `3` Segments) |
| `synthetic` | `syn:*` | `382` | `0.29%` | `synthetic_procurement.py` (`seed=20261112`: `18` Suppliers, `8` Warehouses, `236` Inventory slots, `120` PurchaseOrders) |
| `demonstration` | `demo:*`, `doc:*` | `18` | `0.01%` | `mock-data.json` (`16` `DemoEntity` nodes) + `2` Markdown `Document` metadata nodes |
| **Total** | | **`132,110`** | **`100.00%`** | |

---

## 3. Dataset Evaluation Outcomes

Full provenance metadata (URL, DOI, authors, version, license, SHA-256 digests, exclusion notes) is stored in [dataset_registry.json](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/data/registry/dataset_registry.json) and documented in [SOURCE_ATTRIBUTION.md](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/data/registry/SOURCE_ATTRIBUTION.md).

Summary of the 8 registered sources:
1. `dataco-supply-chain-structured` — **Ingested to Neo4j** (`CC BY 4.0`, `doi:10.17632/8gx2fvg2k6.5`).
2. `dataco-variable-descriptions` — **Validated Dictionary** (`DescriptionDataCoSupplyChain.csv`, `3,444` bytes).
3. `dataco-tokenized-access-logs` — **Evaluated & Excluded** (web clickstream logs lacking procurement/delay keys).
4. `hub-supply-chain-disruption-monitoring` — **Evaluated & Excluded** (`CC BY-NC 4.0`, heavy-industry B2B domain mismatch).
5. `hub-anonnet` — **Evaluated & Excluded** (unspecified license, anonymized network without DataCo SKU linkage).
6. `hub-syndelay` — **Evaluated & Excluded** (unspecified license, noisy generative float IDs/Excel dates).
7. `cortex-mock-demonstration` — **Ingested to Neo4j as `DemoEntity`** (`mock-data.json`, strictly `data_origin="demonstration"`).
8. `cortex-synthetic-procurement` — **Generated & Ingested to Neo4j** (`seed=20261112`, strictly `data_origin="synthetic"`).

