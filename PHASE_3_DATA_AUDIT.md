# CORTEX — PHASE 3 DATA AUDIT (VERIFIED & FINALIZED)
**Comprehensive Audit & Hybridization Strategy for DataCo Supply Chain & Olist E-Commerce Datasets**
*Platform: CORTEX Enterprise Decision Intelligence Platform*  
*Date: 2026-11-18 (Audited and Verified)*  
*Datasets Audited:*
1. **DataCo Global Supply Chain Dataset** (`data/raw/dataco/DataCoSupplyChainDataset.csv`, `data/raw/dataco/DescriptionDataCoSupplyChain.csv`)
2. **Olist Brazilian E-Commerce Dataset** (`data/raw/olist/*.csv` / `data/raw/Olist CSV files/`)

---

## 1. Executive Summary & Verified Scope

This data audit establishes the empirical and mathematical foundation for **Phase 3: Hybrid Data Engineering and Predictive Intelligence**.

Both source repositories were directly profiled without modifying raw files. Across all 10 raw data tables, the dataset encompasses **1,731,441 verified records** (211.82 MB total footprint). The tables were profiled for schema integrity, column data types, missing value distributions, primary/foreign key uniqueness, temporal ranges, empirical associations, data leakage hazards, and cross-dataset compatibility.

| Dataset | Scope / Domain | Record Count | Number of Tables / Files | Date Range | Primary Prediction Targets |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DataCo Supply Chain** | Global sports/apparel enterprise supply chain & financial accounting | 180,519 order items (65,752 orders) | 1 denormalized table (53 columns) | 2015-01-01 to 2018-01-31 (37 months) | Delivery Delay Risk (Binary), Shipping Lead Time (Regression), Fraud Risk |
| **Olist E-Commerce** | Brazilian multi-vendor marketplace with logistics & customer reviews | 99,441 orders (112,650 items, 3,095 sellers, 99,224 reviews) | 9 relational tables (3NF schema) | 2016-09-04 to 2018-10-17 (25 months) | Delivery SLA Delay, Lead Time Duration, Review Score Degradation |
| **Synthetic Procurement** (Phase D1 Foundation) | Enterprise Tier-1 Suppliers, Purchase Orders, Warehouses, Inventory Slots | 100 Suppliers, 120 POs, 24 Warehouses, 500 Inventory Slots | 7 relational tables | 2026-10-01 to 2026-11-12 (Scenario-aware) | Inventory Stockout Risk, PO Delay Impact |

> [!IMPORTANT]
> **Observational Correlation vs. Causal Interpretation:**  
> Analysis of Olist review ratings reveals that orders delivered after the estimated delivery date exhibit a **46.15% incidence of 1-star reviews**, compared to **6.60% for on-time deliveries** (an observational relative risk of $\approx 7.0$). In observational e-commerce data, this strong statistical association serves as an empirical risk proxy for customer churn vulnerability. It must not be interpreted as an unconditional causal proof that delivery delay was the sole root cause, as confounding factors (e.g., product defects, merchant responsiveness, carrier packaging damage) also contribute to negative customer reviews.

---

## 2. CSV Schemas and Column Descriptions

### 2.1 DataCo Supply Chain Dataset
*File: `data/raw/dataco/DataCoSupplyChainDataset.csv` (91.47 MB)*  
*Structure: 180,519 rows × 53 columns (wide denormalized star-schema view)*

| # | Field Name | Inferred Type | Description & Semantic Role |
| :---: | :--- | :--- | :--- |
| 0 | `Type` | Categorical | Payment transaction method: `DEBIT`, `TRANSFER`, `PAYMENT`, `CASH` |
| 1 | `Days for shipping (real)` | Integer | Actual days elapsed from order date to shipping date (**POST-HOC**) |
| 2 | `Days for shipment (scheduled)` | Integer | Scheduled delivery days according to shipping mode (0 to 4 days) |
| 3 | `Benefit per order` | Float | Realized accounting net profit per order (**POST-HOC**) |
| 4 | `Sales per customer` | Float | Net sales price realized per customer after discount (**POST-HOC**) |
| 5 | `Delivery Status` | Categorical | `Late delivery`, `Advance shipping`, `Shipping on time`, `Shipping canceled` |
| 6 | `Late_delivery_risk` | Binary Int | Target indicator: 1 = delivery delayed, 0 = on-time or early |
| 7 | `Category Id` | Integer | Product category identifier (1 to 76) |
| 8 | `Category Name` | Categorical | Category name (50 unique: `Cleats`, `Men's Footwear`, `Cardio Equipment`, etc.) |
| 9 | `Customer City` | Categorical | City of the purchasing customer |
| 10 | `Customer Country` | Categorical | Country of customer (`Puerto Rico`, `EE. UU.`) |
| 11 | `Customer Email` | Masked String | Customer email address (anonymized: `XXXXXXXXX`) |
| 12 | `Customer Fname` | String | Customer first name |
| 13 | `Customer Id` | Integer | Unique identifier of customer account (20,652 unique) |
| 14 | `Customer Lname` | String | Customer last name |
| 15 | `Customer Password` | Masked String | Customer password key (anonymized: `XXXXXXXXX`) |
| 16 | `Customer Segment` | Categorical | Market segment: `Consumer` (51.9%), `Corporate` (30.3%), `Home Office` (17.8%) |
| 17 | `Customer State` | Categorical | Customer state code (PR, CA, NY, TX, etc.) |
| 18 | `Customer Street` | String | Customer address street name |
| 19 | `Customer Zipcode` | Float/Int | Customer postal code |
| 20 | `Department Id` | Integer | Store department code (2 to 12) |
| 21 | `Department Name` | Categorical | Department name: `Fitness`, `Apparel`, `Golf`, `Footwear`, `Outdoors`, `Fan Shop` |
| 22 | `Latitude` | Float | Store/warehouse dispatch latitude coordinate |
| 23 | `Longitude` | Float | Store/warehouse dispatch longitude coordinate |
| 24 | `Market` | Categorical | Destination global trade zone: `LATAM`, `Europe`, `Pacific Asia`, `USCA`, `Africa` |
| 25 | `Order City` | Categorical | Destination city of the delivery order |
| 26 | `Order Country` | Categorical | Destination country of the order (164 countries) |
| 27 | `Order Customer Id` | Integer | Customer ID placed on order (matches `Customer Id`) |
| 28 | `order date (DateOrders)` | Timestamp | Order placement timestamp (`M/D/YYYY HH:MM`) |
| 29 | `Order Id` | Integer | Order header transaction code (65,752 unique) |
| 30 | `Order Item Cardprod Id` | Integer | RFID product code (matches `Product Card Id`) |
| 31 | `Order Item Discount` | Float | Discount dollar value applied to item |
| 32 | `Order Item Discount Rate` | Float | Discount percentage applied (0.00 to 0.25) |
| 33 | `Order Item Id` | Integer | Line-item primary key (180,519 unique records) |
| 34 | `Order Item Product Price` | Float | Catalog unit price of product before discount |
| 35 | `Order Item Profit Ratio` | Float | Realized profit percentage on item (**POST-HOC**) |
| 36 | `Order Item Quantity` | Integer | Quantity of units ordered (1 to 5 units) |
| 37 | `Sales` | Float | Gross sales value (`Product Price` × `Quantity`) |
| 38 | `Order Item Total` | Float | Net line item sales (`Sales` - `Discount`) |
| 39 | `Order Profit Per Order` | Float | Total order profit contribution (**POST-HOC**) |
| 40 | `Order Region` | Categorical | Geographic sub-region (23 regions: `Western Europe`, `Central America`, etc.) |
| 41 | `Order State` | Categorical | Destination state/province |
| 42 | `Order Status` | Categorical | Terminal transaction state: `COMPLETE`, `PENDING_PAYMENT`, `PROCESSING`, `SUSPECTED_FRAUD`, etc. |
| 43 | `Order Zipcode` | Float/Int | Destination postal code (86.2% unpopulated) |
| 44 | `Product Card Id` | Integer | Internal product catalog ID (118 unique products) |
| 45 | `Product Category Id` | Integer | Product category key |
| 46 | `Product Description` | String | Blank/unpopulated column (100% missing) |
| 47 | `Product Image` | URL String | Image URL of product catalog asset |
| 48 | `Product Name` | String | Catalog product name |
| 49 | `Product Price` | Float | Item base unit price ($9.99 to $1,999.99 USD) |
| 50 | `Product Status` | Binary Int | Inventory availability flag (all records = 0, available) |
| 51 | `shipping date (DateOrders)`| Timestamp | Dispatch timestamp from warehouse (**POST-HOC**) |
| 52 | `Shipping Mode` | Categorical | `Standard Class`, `Second Class`, `First Class`, `Same Day` |

---

### 2.2 Olist Brazilian E-Commerce Dataset
*Directory: `data/raw/olist/` (122.9 MB total)*  
*Structure: 9 normalized tables implementing a 3NF relational model*

```
 ┌──────────────────────┐         ┌───────────────────────┐         ┌─────────────────────┐
 │   olist_customers    │         │     olist_orders      │         │   olist_reviews     │
 ├──────────────────────┤         ├───────────────────────┤         ├─────────────────────┤
 │ customer_id (PK)     │◄───1:1──┤ customer_id (FK)      │───1:N──►│ review_id           │
 │ customer_unique_id   │         │ order_id (PK)         │         │ order_id (FK)       │
 │ customer_zip_code    │         │ order_status          │         │ review_score [1-5]  │
 │ customer_city/state  │         │ order_purchase_time   │         │ review_comment_msg  │
 └──────────────────────┘         │ order_delivered_date  │         └─────────────────────┘
                                  │ order_estimated_date  │
                                  └──────────┬────────────┘
                                             │ 1:N
                                             ▼
                                  ┌───────────────────────┐
                                  │   olist_order_items   │
                                  ├───────────────────────┤
                                  │ order_id (FK)         │
                                  │ order_item_id         │
                                  │ product_id (FK)       │────► ┌─────────────────────────┐
                                  │ seller_id (FK)        │      │     olist_products      │
                                  │ price                 │      ├─────────────────────────┤
                                  │ freight_value         │      │ product_id (PK)         │
                                  │ shipping_limit_date   │      │ product_category_name   │
                                  └──────────┬────────────┘      │ product_weight_g        │
                                             │ N:1               │ dimensions (L × W × H)  │
                                             ▼                   └─────────────────────────┘
                                  ┌───────────────────────┐
                                  │     olist_sellers     │
                                  ├───────────────────────┤
                                  │ seller_id (PK)        │
                                  │ seller_zip_code       │
                                  │ seller_city/state     │
                                  └───────────────────────┘
```

#### Detailed Table Specifications:
1. **`olist_orders_dataset.csv` (99,441 records):**
   - Keys: `order_id` (PK, 99,441 unique), `customer_id` (FK).
   - Milestones: `order_purchase_timestamp`, `order_approved_at`, `order_delivered_carrier_date`, `order_delivered_customer_date`, `order_estimated_delivery_date`.
2. **`olist_order_items_dataset.csv` (112,650 records):**
   - Composite Key: `(order_id, order_item_id)` (100% unique).
   - Foreign Keys: `product_id`, `seller_id`.
   - Financials: `price` (BRL R$ 0.85 to 6,735.00), `freight_value` (BRL R$ 0.00 to 409.68).
3. **`olist_order_reviews_dataset.csv` (99,224 logical records):**
   - Composite Key: `(review_id, order_id)` (100% unique).
   - Rating: `review_score` (1 to 5). Note: Multi-line strings in review comments expand to 104,719 raw text lines on disk, but parse into exactly 99,224 CSV records via RFC 4180 parsing.
4. **`olist_order_payments_dataset.csv` (103,886 records):**
   - Attributes: `payment_type`, `payment_installments`, `payment_value`.
5. **`olist_products_dataset.csv` (32,951 records):**
   - Physical metrics: `product_weight_g`, `product_length_cm`, `product_height_cm`, `product_width_cm`, `product_photos_qty`.
6. **`olist_sellers_dataset.csv` (3,095 records):**
   - Geographic distribution of 3rd-party marketplace merchants: `seller_zip_code_prefix`, `seller_city`, `seller_state`.
7. **`olist_customers_dataset.csv` (99,441 records):**
   - Mapping `customer_id` to `customer_unique_id` (96,096 distinct consumers; 3,345 repeat buyers).
8. **`olist_geolocation_dataset.csv` (1,000,163 records):**
   - High-density coordinates: `geolocation_lat`, `geolocation_lng`, `geolocation_zip_code_prefix`.
9. **`product_category_name_translation.csv` (71 records):**
   - English translation lookup for Portuguese category descriptors.

---

## 3. Verified Record Counts and Data Types Summary

| Table | File Size | Actual Data Rows | Columns | Verified Data Types |
| :--- | :--- | :--- | :--- | :--- |
| `DataCoSupplyChainDataset` | 91.47 MB | 180,519 | 53 | 14 Int, 12 Float, 2 Datetime, 25 Categorical/String |
| `olist_orders` | 16.84 MB | 99,441 | 8 | 2 UUID String, 1 Categorical, 5 Datetime |
| `olist_order_items` | 14.72 MB | 112,650 | 7 | 3 UUID String, 1 Int, 1 Datetime, 2 Float |
| `olist_order_payments` | 5.51 MB | 103,886 | 5 | 1 UUID String, 2 Int, 1 Categorical, 1 Float |
| `olist_order_reviews` | 13.78 MB | 99,224 | 7 | 2 UUID String, 1 Int, 2 String Text, 2 Datetime |
| `olist_products` | 2.27 MB | 32,951 | 9 | 1 UUID String, 1 Categorical, 7 Int/Float |
| `olist_sellers` | 0.17 MB | 3,095 | 4 | 1 UUID String, 1 Int, 2 Categorical String |
| `olist_customers` | 8.62 MB | 99,441 | 5 | 2 UUID String, 1 Int, 2 Categorical String |
| `olist_geolocation` | 58.44 MB | 1,000,163 | 5 | 1 Int, 2 Float Coordinates, 2 Categorical String |
| `product_category_translation`| 2.61 KB | 71 | 2 | 2 String (Portuguese, English) |
| **Combined Raw Transaction Total** | **211.82 MB**| **1,731,441**| **105** | — |

*Verification Note:* All counts verified via standard Python RFC-4180 CSV reader. Disk lines differ only on `olist_order_reviews_dataset.csv` due to embedded newline characters in Brazilian customer reviews.

---

## 4. Architectural Distinction: Marketplace Sellers vs. Enterprise Suppliers

A foundational error in naive supply chain models is conflating **marketplace sellers** with **enterprise suppliers**. CORTEX strictly distinguishes these two operational entities:

```
┌────────────────────────────────────────────────────────┐  ┌────────────────────────────────────────────────────────┐
│        OLIST MARKETPLACE SELLERS (3P MERCHANTS)        │  │          ENTERPRISE DIRECT SUPPLIERS (TIER-1)          │
├────────────────────────────────────────────────────────┤  ├────────────────────────────────────────────────────────┤
│ • Structure: 3,095 independent small/medium merchants. │  │ • Structure: Contracted industrial manufacturers.      │
│ • Commercial Relationship: Platform marketplace B2C.   │  │ • Commercial Relationship: Formal Master Service Agrmt.│
│ • Fulfillment: Drop-shipped individually to consumers. │  │ • Fulfillment: Bulk Purchase Orders to central WHs.    │
│ • Volume: 1–5 units per consumer transaction.          │  │ • Volume: 50–5,000 palletized units per PO shipment.   │
│ • Lead Times: 1–5 days merchant dispatch to carrier.   │  │ • Lead Times: 10–45 days production & freight transit.  │
│ • Governance: Platform ratings and account suspension. │  │ • Governance: Contractual SLA penalties & liquidated   │
│ • Role in CORTEX: Empirical benchmark of merchant      │  │   damages.                                             │
│   dispatch variability & last-mile logistics friction. │  │ • Role in CORTEX: Upstream inventory replenishment &   │
│                                                        │  │   safety-stock depletion / stockout risk driver.       │
└────────────────────────────────────────────────────────┘  └────────────────────────────────────────────────────────┘
```

**Implementation Rule:**  
- Olist sellers are modeled as `MarketplaceMerchant` entities providing distribution statistics for parcel delivery duration and fulfillment friction.
- Enterprise direct suppliers are modeled as `Supplier` nodes in the CORTEX Knowledge Graph (anchored by DataCo and Phase D1 synthetic procurement), driving Purchase Orders, inventory stocking, and multi-echelon stockout risks.

---

## 5. Currency, Geography, and Source-Stream Separation

To maintain data provenance, scientific reproducibility, and financial accuracy, the datasets are governed as **three strictly isolated source streams**:

1. **DataCo Stream (Enterprise Global Distribution):**
   - **Currency:** US Dollars (USD, $).
   - **Geography:** Global trade corridors across 164 countries and 5 continental markets (`LATAM`, `Europe`, `Pacific Asia`, `USCA`, `Africa`). Store coordinates centered in Puerto Rico and US continental locations.
   - **Provenance:** Tagged `source_dataset='dataco'`, `is_synthetic=False`.
2. **Olist Stream (Domestic Brazilian Marketplace):**
   - **Currency:** Brazilian Reais (BRL, R$).
   - **Geography:** Domestic Brazilian territory (27 Federative Units: SP, RJ, MG, RS, PR, etc.) mapped through 1,000,163 geolocation records.
   - **Provenance:** Tagged `source_dataset='olist'`, `is_synthetic=False`.
3. **Synthetic Procurement Stream (Phase D1 Scenario Backbone):**
   - **Currency:** US Dollars (USD, $).
   - **Geography:** Multi-facility industrial network across North America and APAC.
   - **Provenance:** Tagged `source_dataset='synthetic_procurement'`, `is_synthetic=True`.

> [!CAUTION]
> **No Arbitrary Row-Level Merges:**  
> DataCo and Olist do not share common natural keys, foreign keys, or customer populations. Creating artificial row joins (e.g., joining an Olist order item to a DataCo product ID) produces synthetic chimeric records that destroy provenance. Instead, cross-dataset intelligence operates at the **statistical distribution and entity-profile level** (e.g., mapping category-level lead time distributions and merchant reliability scores).

---

## 6. Prediction Targets, Feature Availability & Data Leakage Safeguards

### 6.1 Prediction Target Taxonomy

| Target Identifier | Type | Prediction Horizon ($T_0$) | Definition & Ground Truth Target | Target Distribution |
| :--- | :--- | :--- | :--- | :--- |
| **Target 1: Delivery Delay Risk** | Binary Classification | Order Placement Time ($T_{\text{purchase}}$) | `y = 1` if actual shipping/delivery exceeds promised/scheduled threshold | DataCo: 54.83% Late<br>Olist: 8.11% Late |
| **Target 2: Inventory Stockout Risk** | Binary Classification | PO Lead Time Horizon ($T_{\text{reorder}}$) | `y = 1` if warehouse inventory balance drops below safety stock threshold before PO receipt | Synthetic Scenario: 24.0% Stockout Slots |
| **Target 3: Demand Forecasting** | Time Series Regression | Weekly / Monthly Intervals | Multi-horizon aggregate product category demand at **7-day**, **30-day**, and **90-day** steps | Continuous daily units sold |

### 6.2 Data Leakage Safeguards & Temporal Horizons

A feature is strictly invalid if its value cannot be known at prediction time $T_0$:

```
 TIMELINE OF AN ORDER LIFECYCLE:
 ────┬──────────────────┬─────────────────┬──────────────────┬────────────────►
     │                  │                 │                  │
    T0                 T1                T2                 T3
 Order Placement   Carrier Handoff    Customer Delivery  Post-Delivery Review
 [FEATURES VALID]  [LEAKAGE HAZARD]  [LEAKAGE HAZARD]   [LEAKAGE HAZARD]
 • Catalog price   • Real ship date  • Real deliv date  • Review score
 • Scheduled mode  • Real ship days  • Delivery status  • Review comment
 • Destination zip • Carrier scan    • Late_delivery_risk• Customer complaint
 • Product weight                    • Order status     • Realized profit
 • Historical perf
```

#### Disallowed Features (Target Leakage):
- `Days for shipping (real)` & `shipping date (DateOrders)`: Directly encode the outcome.
- `Delivery Status`: Identical to the binary target.
- `Order Status` (`COMPLETE`, `CLOSED`, `SUSPECTED_FRAUD`, `CANCELED`): Terminal state not observed at checkout.
- Post-sale accounting margins (`Benefit per order`, `Order Profit Per Order`, `Order Item Profit Ratio`): Reflect realized refunds, chargebacks, and freight surcharges.

#### Permitted Features at Order Placement ($T_0$):
- **Temporal:** Day of week, day of month, month, quarter, holiday indicator.
- **Product & Order:** Catalog unit price, line item quantity, pre-set discount rate, department ID, category ID, package weight (`product_weight_g`), physical volume ($L \times W \times H$).
- **Spatial:** Origin-destination Haversine distance, destination region/market/state.
- **Service Level:** Scheduled shipping mode (`Standard`, `Second Class`, `First Class`, `Same Day`), scheduled target days.
- **Historical Profile:** Rolling 30-day on-time fulfillment rate of the assigned merchant/corridor prior to $T_0$.

---

## 7. Recommendations for Phase 3 Hybrid Engineering

1. **Formalize Canonical Data Contracts:**
   - Establish clean, typed data pipelines transforming raw CSV inputs into parquet/feather datasets partitioned by source stream.
2. **Deterministic Train/Validation/Test Split:**
   - Apply temporal cutoff dates rather than randomized shuffling to prevent future data bleeding into past predictions.
   - *DataCo Split:* Train: Jan 2015 – Dec 2016; Validation: Jan 2017 – Jun 2017; Test: Jul 2017 – Jan 2018.
   - *Olist Split:* Train: Sep 2016 – Dec 2017; Validation: Jan 2018 – Apr 2018; Test: May 2018 – Oct 2018.
3. **Multi-Model Suite:**
   - Train baseline models (Dummy / Logistic Regression / Ridge / Moving Average) followed by tuned gradient boosted decision trees (LightGBM / XGBoost) with class-weight balancing and calibrated probability outputs.
4. **Quantified Monte Carlo Simulation Engine:**
   - Develop vectorized scenario generators modeling correlated demand shocks, supplier lead-time extensions, and margin compression with Value at Risk (VaR) and Conditional VaR (CVaR).
