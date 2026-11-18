# Dataset Source Attribution & Licensing Notice

This document records the authoritative provenance, licensing terms, cryptographic digests, and academic attribution for all datasets evaluated or ingested in **CORTEX Phase D1**. Machine-readable entries are maintained in [dataset_registry.json](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/data/registry/dataset_registry.json).

---

## 1. Primary Structured Dataset (Ingested — `data_origin="public_open_dataset"`)

- **Title:** DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS
- **Authors:** Fabian Constante, Fernando Silva, António Pereira
- **Repository:** Mendeley Data (Version 5)
- **Official URL:** https://data.mendeley.com/datasets/8gx2fvg2k6/5
- **DOI:** `10.17632/8gx2fvg2k6.5`
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0)

### Acquired Files & SHA-256 Checksums

| File | Size (Bytes) | SHA-256 Checksum | Status |
| :--- | :--- | :--- | :--- |
| `DataCoSupplyChainDataset.csv` | `95,910,149` | `fa6d022ed437155e1a2f0378710602848703c8a7f203f7ff5d77805bf8480aa6` | Verified & Ingested (`180,519` rows x `53` cols) |
| `DescriptionDataCoSupplyChain.csv` | `3,444` | `9828e34669bd6d77e3b4463364cc44a5d52446b5e246fc258758cfe592566c4b` | Verified Data Dictionary (`52` documented variables) |
| `tokenized_access_logs.csv` | `95,446,364` | `7a4372df63a1e87f5add68bc036bb6064db09069998f25a679aec39f1a8d7765` | Inspected & Excluded (`evaluated_excluded_clickstream` — anonymous web browsing logs without supplier/order/delay linkage) |

### Required Attribution Citation

> Constante, Fabian; Silva, Fernando; Pereira, António (2019), "DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS", Mendeley Data, V5, doi: 10.17632/8gx2fvg2k6.5

---

## 2. Evaluated External Research Candidates (Inspected & Excluded — `evaluated_excluded_optional`)

Candidates from the Supply Chain Data Hub catalog (https://supplychaindatahub.org/datasets/) were evaluated during Phase D1 discovery and excluded from core Neo4j ingestion for explicit technical and licensing reasons:

| Dataset | Authors / Source | URL | License | Exclusion Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Supply Chain Disruption Monitoring Dataset** (`supplychainKG_clean.csv`) | Sara Almahri, Liming Xu, Alexandra Brintrup | https://supplychaindatahub.org/datasets/supply-chain-disruption/ | CC BY-NC 4.0 (Non-Commercial) | Contains B2B heavy-industry triples (Oil & Gas, Steel) incompatible with DataCo retail product SKUs and carries non-commercial (`NC`) restriction. |
| **AnonNet Dataset** (`mim2025_network_challenge`) | Liming Xu, Yunbo Long, Alexandra Brintrup | https://supplychaindatahub.org/datasets/anonnet/ | Unspecified (No `LICENSE` file in repo) | Anonymized network topology without DataCo catalog keys, procurement delay timestamps, or explicit permissive license. |
| **SynDelay Dataset** (`syndelay_v1.csv`) | Liming Xu, Yunbo Long, Alexandra Brintrup | https://supplychaindatahub.org/datasets/syndelay/ | Unspecified (No `LICENSE` file in repo) | Generative DataCo-derived file containing noisy floating-point identifiers/Excel dates (e.g., `12446.5625`), missing supplier entities and explicit license. |

---

## 3. CORTEX Project Demonstration Dataset (`data_origin="demonstration"`)

- **File:** `mock-data.json` (`53,376` bytes, SHA-256 `1589026e1ae3cfeb013dfb9cc4821ae54c4313415d36ad9eaf0fc1f963cf21a5`)
- **Attribution:** CORTEX Capstone Project Team (Phase A–C seed artifact)
- **Treatment:** Namespaced strictly with `demo:*` entity IDs (`DemoEntity` nodes / `DEMO_REL` edges) and excluded from operational DataCo metrics.

---

## 4. CORTEX Reproducible Synthetic Procurement Extension (`data_origin="synthetic"`)

- **Generator:** [synthetic_procurement.py](file:///home/obito/Downloads/nexus-enterprise-decision-intelligence-platform/intelligence/src/cortex_intelligence/generators/synthetic_procurement.py)
- **Random Seed:** `20261112` (`SYNTHETIC_RANDOM_SEED`)
- **Purpose:** Fills domain gaps absent in DataCo (Tier-1/2/3 `Supplier`, `Warehouse`, `Inventory`, and `PurchaseOrder` delay propagation) anchored strictly to verified DataCo `Product` (`118`) and `Region` (`23`) identifiers. All generated records carry `dataOrigin="synthetic"`.

