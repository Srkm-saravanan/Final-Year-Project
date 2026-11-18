# CORTEX Phase D1 Data Quality & Profiling Report

**Source Run:** `job-20261112-152958-61667c66` (`2026-11-12T15:30:12Z`)  
**Machine-Readable Report:** `data/processed/reports/data_quality_summary.json`

---

## 1. Cryptographic Integrity & Encoding Validation

| Metric | Observed Value |
| :--- | :--- |
| Source File | `data/raw/dataco/DataCoSupplyChainDataset.csv` |
| File Size | `95,910,149` bytes |
| Verified SHA-256 | `fa6d022ed437155e1a2f0378710602848703c8a7f203f7ff5d77805bf8480aa6` |
| Detected Encoding | `cp1252` (UTF-8 decoding fails on byte `0xe1`; handled deterministically without character corruption) |
| CSV Dimensions | `180,519` rows x `53` columns |
| Undocumented Columns vs. Dictionary | `Order Zipcode`, `shipping date (DateOrders)` (`DescriptionDataCoSupplyChain.csv` lists `52` variables) |

---

## 2. Missingness & Structural Anomalies

| Column | Null Count | Null Rate | Pipeline Action |
| :--- | :---: | :---: | :--- |
| `Product Description` | `180,519` | `100.00%` | Dropped (`all_null_columns`) |
| `Order Zipcode` | `155,679` | `86.24%` | Excluded (high-sparsity postal field) |
| `Customer Lname` | `8` | `0.004%` | Removed with all `Customer *` PII fields |
| `Customer Zipcode` | `3` | `0.002%` | Removed with all `Customer *` PII fields |

### Whitespace & String Normalization
Total whitespace anomalies cleaned and collapsed across all rows: **`21,604` fields**.  
Measured profiling anomalies prior to trimming:
- `Order Region`: `17,925` fields
- `Customer Street`: `1,829` fields
- `Product Name`: `1,774` fields
- `Category Name`: `1,475` fields
- `Product Image`: `886` fields
- `Department Name`: `362` fields

---

## 3. Deduplication & Cleaning Results

| Cleaning Metric | Count | Outcome |
| :--- | :---: | :--- |
| Raw rows read | `180,519` | — |
| Accepted & normalized rows | `180,519` | `100%` line-item retention |
| Rejected rows (duplicates / invalid IDs / bad dates / invalid numerics) | `0` | Verified against synthetic malformed fixtures in `pytest` |
| PII / excluded columns removed | `15` | Customer PII (`Fname`, `Lname`, `Email`, `Password`, `Street`, `City`, `State`, `Country`, `Zipcode`, `Id`, `Order Customer Id`), `Order Zipcode`, `Product Image`, `Latitude`, `Longitude` |
| Multi-line order preservation | `180,519` items in `65,752` orders | Keyed `(Order)-[:CONTAINS]->(Product)` by unique `Order Item Id` (`sourceRecordId`) |

---

## 4. Domain Distributions & Profit Outlier Analysis

### Order Profit Per Order (Tukey IQR Quantiles)
- **Minimum:** `-$4,274.98` | **Q1:** `$7.00` | **Median:** `$31.52` | **Q3:** `$64.80` | **Maximum:** `$911.80`
- **IQR:** `$57.80` | **Lower Fence:** `-$79.70` | **Upper Fence:** `$151.50`
- **Negative-Profit Order Items Retained:** `33,784` (`18.71%` of line items) — retained as valid business loss signals rather than clipped.
- **IQR Outlier Items Flagged (`isProfitOutlier=true`):** `18,942` (`10.49%`).

### Delivery Status Distribution (`180,519` rows)
- `Late delivery`: `98,977` (`54.83%`)
- `Advance shipping`: `41,592` (`23.04%`)
- `Shipping on time`: `32,196` (`17.84%`)
- `Shipping canceled`: `7,754` (`4.30%`)

### Order Status Distribution (`180,519` rows)
- `COMPLETE`: `59,491` | `PENDING_PAYMENT`: `39,832` | `PROCESSING`: `21,902` | `PENDING`: `20,227`
- `CLOSED`: `19,616` | `ON_HOLD`: `9,804` | `SUSPECTED_FRAUD`: `4,062` | `CANCELED`: `3,692` | `PAYMENT_REVIEW`: `1,893`

---

## 5. Idempotency & Graph Verification Proof

Running the full pipeline twice consecutively produced **identical graph totals with zero duplication**:
- **Run 1 (`job-20261112-152846-064672b0`):** `132,110` nodes, `379,120` relationships, `0` missing provenance, `0` duplicate `entityId`s.
- **Run 2 (`job-20261112-152958-61667c66`):** `132,110` nodes, `379,120` relationships, `0` missing provenance, `0` duplicate `entityId`s.

