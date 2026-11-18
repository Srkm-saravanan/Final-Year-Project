# CORTEX — PHASE 3 DATA ENGINEERING DESIGN & SPECIFICATION
**Hybrid Data Ingestion, Stream Governance & ML Feature Store**
*Platform: CORTEX Enterprise Decision Intelligence Platform*  
*Date: 2026-11-18*

---

## 1. Overview & Architectural Goals

The Phase 3 Data Engineering pipeline bridges the heterogeneous raw datasets into clean, typed, reproducible ML feature stores without compromising data provenance, introducing data leakage, or performing invalid cross-domain row joins.

### Core Principles Enforced:
1. **Source Stream Isolation:** DataCo (Global Enterprise), Olist (Brazilian E-Commerce), and Synthetic Procurement (Enterprise Direct Suppliers & Inventory) are processed as separate data streams with distinct schemas and currencies.
2. **Provenance Tracking:** Every record is stamped with `source_dataset` (`dataco`, `olist`, `synthetic_procurement`) and `is_synthetic` (`True` or `False`).
3. **Strict Zero-Leakage Feature Extraction:** All features fed to ML training matrices represent information strictly available at order placement time ($T_0$). Post-fulfillment variables (`Days for shipping (real)`, `order_delivered_customer_date`, `Delivery Status`, realized profits) are strictly segregated into target/evaluation spaces.
4. **Deterministic Chronological Splitting:** Training, validation, and test sets are partitioned chronologically by order timestamp ($70\%$ train, $15\%$ validation, $15\%$ test), preventing temporal information bleeding.

---

## 2. Source-to-Target Data Flow

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                                RAW DATA INGESTION                           │
 ├──────────────────────────────┬───────────────────────────────┬──────────────┤
 │ DataCoSupplyChainDataset.csv │ Olist E-Commerce (9 CSVs)     │ Synthetic PO │
 │ (180,519 rows, USD $)        │ (112,650 items, BRL R$)       │ (7 CSVs)     │
 └──────────────┬───────────────┴───────────────┬───────────────┴──────┬───────┘
                │                               │                      │
                ▼                               ▼                      ▼
 ┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────┐
 │     DataCo Clean Pipeline    ││     Olist Clean Pipeline     ││ Stockout Ppl │
 │ • Drop 100% missing cols     ││ • RFC-4180 review parsing    ││ • Buffer gap │
 │ • Parse timestamps           ││ • Portuguese translations    ││ • PO delays  │
 │ • Stable IDs: dataco:item:...││ • Delay targets              ││ • Safety stk │
 └──────────────┬───────────────┘└──────────────┬───────────────┘└──────┬───────┘
                │                               │                      │
                ▼                               ▼                      ▼
 ┌──────────────────────────────┐┌──────────────────────────────┐┌──────────────┐
 │   dataco_clean.parquet       ││   olist_clean.parquet        ││ stockout_    │
 │   (180,519 rows)             ││   (110,189 rows)             ││ risk_features│
 └──────────────┬───────────────┘└──────────────┬───────────────┘│ (236 rows)   │
                │                               │                └──────┬───────┘
                └───────────────────────┬───────┘                       │
                                        │                               │
                                        ▼                               ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         CANONICAL HYBRID ML FEATURE STORE                   │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ 1. `delivery_delay_features.parquet` (180,519 rows) — Chronological splits  │
 │ 2. `stockout_risk_features.parquet`  (236 rows)     — Inventory buffer risk │
 │ 3. `daily_category_demand.parquet`   (17,151 rows)  — Multi-horizon forecast│
 │ 4. `hybrid_manifest.json`            (Audit trail & validation checksums)   │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Canonical Dataset Specifications

### 3.1 Delivery Delay Feature Store (`delivery_delay_features.parquet`)
- **Record Count:** 180,519
- **Chronological Split:**
  - `train` (70%, 126,363 rows): 2015-01-01 to 2017-02-28
  - `val` (15%, 27,078 rows): 2017-03-01 to 2017-08-15
  - `test` (15%, 27,078 rows): 2017-08-16 to 2018-01-31
- **Feature Set ($T_0$ Pre-Order):**
  - Temporal: `order_hour` (0–23), `order_dow` (0–6), `order_month` (1–12), `order_quarter` (1–4)
  - Logistics: `scheduled_shipping_days` (0, 1, 2, 4), `shipping_mode` (`Standard Class`, `Second Class`, `First Class`, `Same Day`)
  - Commercial: `customer_segment` (`Consumer`, `Corporate`, `Home Office`), `market` (`LATAM`, `Europe`, `Pacific Asia`, `USCA`, `Africa`), `order_region` (23 global regions)
  - Product Economics: `category_name` (50 categories), `unit_price`, `quantity`, `discount_rate`
- **Prediction Target:** `late_delivery_risk` ($0$ = On-Time, $1$ = Late; $54.83\%$ positive class).

### 3.2 Inventory Stockout Risk Feature Store (`stockout_risk_features.parquet`)
- **Record Count:** 236 warehouse inventory positions across 24 regional distribution centers.
- **Feature Set:**
  - Warehouse Metadata: `warehouse_code`, `name`, `market`, `capacity_units`
  - Inventory Metrics: `on_hand_units`, `safety_stock_units`, `reorder_point_units`, `shortage_units`
  - PO Linkage: `is_directly_affected_by_po_delay` (binary flag indicating an active delayed upstream purchase order).
- **Stockout Ground Truth:** `stockout_risk` ($1$ if `on_hand_units < safety_stock_units` OR affected by critical PO delay; $35.17\%$ positive class).

### 3.3 Daily Category Demand Feature Store (`daily_category_demand.parquet`)
- **Record Count:** 17,151 daily observations across 50 product categories over 3 full years (Jan 1, 2015 – Jan 31, 2018).
- **Metrics:**
  - `daily_units`: Total order item quantity sold in category per day.
  - `daily_revenue`: Net realized revenue in category per day.
  - `order_count`: Total transaction order volume in category per day.
- **Forecasting Horizons Supported:** 7-day, 30-day, and 90-day forward horizons.

---

## 4. Pipeline Implementation & Execution

The pipeline is implemented in:
- Module: `intelligence/src/cortex_intelligence/data_engineering/hybrid_pipeline.py`
- Package Entrypoint: `intelligence/src/cortex_intelligence/data_engineering/__init__.py`

Execution is invoked programmatically via `HybridDataPipeline().generate_hybrid_ml_datasets()` or via CLI. Output artifacts are persisted with Snappy-compressed Apache Parquet format for high-speed columnar read performance in training loops.

