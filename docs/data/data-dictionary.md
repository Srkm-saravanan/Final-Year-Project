# CORTEX Phase D1 Data Dictionary & Feature Governance

This dictionary documents the source columns of `DataCoSupplyChainDataset.csv` (`53` columns), canonical cleaning mappings, PII exclusions, and strict machine-learning leakage separation enforced in `pipeline/cleaning.py` and `models/canonical.py`.

---

## 1. Source Schema Reconciliation (`DataCoSupplyChainDataset.csv`)

While `DescriptionDataCoSupplyChain.csv` documents **52** variables, empirical CSV header inspection identified **53** columns:
- **Undocumented Columns Flagged:** `Order Zipcode` (absent in dictionary; `155,679 / 180,519` nulls = `86.24%`) and `shipping date (DateOrders)` (dictionary row misspells key as `shipping date (DateOrders)` mismatching trailing/case conventions or omitted entry).
- **Empty Column Flagged:** `Product Description` is `100%` null (`180,519 / 180,519` nulls).
- **Character Encoding:** `UTF-8` fails on byte `0xe1`; pipeline uses fallback detection (`cp1252` / `latin-1`).

---

## 2. PII & Excluded Columns (Dropped Prior to Canonical Extraction)

Removed in `PII_AND_EXCLUDED_COLUMNS` (`pipeline/cleaning.py`) so sensitive or noisy attributes never enter structured graph nodes:

| Source Column | Reason for Exclusion |
| :--- | :--- |
| `Customer Fname`, `Customer Lname` | Personal names (PII) |
| `Customer Email`, `Customer Password` | Credential / contact PII |
| `Customer Street`, `Customer City`, `Customer State`, `Customer Zipcode`, `Customer Country` | Residential address PII (geographic aggregation retained at `Order Region` / `Order Country` / `Order City` level instead) |
| `Customer Id`, `Order Customer Id` | Individual customer identifiers; retained only aggregated `Customer Segment` |
| `Order Zipcode` | Sparse/postal identifier (`86.24%` missing) |
| `Latitude`, `Longitude` | High-cardinality raw coordinates (with regional hierarchy modeled cleanly via `Region`) |
| `Product Image` | Dead/external static image URL strings |
| `Product Description` | `100%` null across all `180,519` rows |

---

## 3. Canonical Cleaned Fields & ML Leakage Separation

To support leakage-free predictive modeling in future phases without losing historical ground truth on completed orders, shipment fields on `ShipmentEntity` are partitioned into **pre-shipment inputs** versus **post-outcome evaluation labels**:

### 3.1 Pre-Shipment / Order Attributes (ML-Safe Features)

| Canonical Field | Source Column | Type | Cleaning Rule |
| :--- | :--- | :--- | :--- |
| `source_record_id` | `Order Item Id` | `string` | Primary unique line-item key; duplicates rejected |
| `order_id` | `Order Id` | `string` | Groups multi-item lines (`65,752` unique orders) |
| `order_date` | `order date (DateOrders)` | ISO-8601 string | Parsed strictly from `%m/%d/%Y %H:%M` |
| `order_status` | `Order Status` | `string` | Normalized uppercase (`COMPLETE`, `PENDING_PAYMENT`, etc.) |
| `payment_type` | `Type` | `string` | Normalized uppercase (`DEBIT`, `TRANSFER`, `PAYMENT`, `CASH`) |
| `customer_segment` | `Customer Segment` | `string` | Trimmed (`Consumer`, `Corporate`, `Home Office`) |
| `market`, `order_region`, `order_country`, `order_city` | `Market`, `Order Region`, `Order Country`, `Order City` | `string` | Whitespace trimmed & collapsed |
| `department_id`, `department_name` | `Department Id`, `Department Name` | `string` | Trimmed (`11` unique departments) |
| `category_id`, `category_name` | `Category Id`, `Category Name` | `string` | Trimmed (`51` unique categories) |
| `product_id`, `product_name`, `product_price`, `product_status` | `Product Card Id`, `Product Name`, `Product Price`, `Product Status` | `string` / `float` | `product_price > 0`; `0` mapped to `"Available"` |
| `quantity`, `discount_rate`, `sales`, `order_item_total`, `profit_per_order` | `Order Item Quantity`, `Order Item Discount Rate`, `Sales`, `Order Item Total`, `Order Profit Per Order` | `int` / `float` | `quantity > 0`, `0 <= discount_rate <= 1`; negative profit preserved (`is_profit_outlier` IQR flagged) |
| `shipping_mode` | `Shipping Mode` | `string` | Trimmed (`Standard Class`, `Second Class`, `First Class`, `Same Day`) |
| `scheduled_shipping_days` | `Days for shipment (scheduled)` | `int` (`>= 0`) | Planning target known at order creation |

### 3.2 Post-Outcome Evaluation Labels (Stored on `Shipment` as `eval*` ONLY)

| Canonical Property | Source Column | Type | Governance Rule |
| :--- | :--- | :--- | :--- |
| `evalRealShippingDays` | `Days for shipping (real)` | `int` | Realized transit days — **post-outcome evaluation only** |
| `evalDeliveryStatus` | `Delivery Status` | `string` | `Advance shipping`, `Late delivery`, `Shipping on time`, `Shipping canceled` |
| `evalLateDeliveryRisk` | `Late_delivery_risk` | `int` (`0` \| `1`) | Ground-truth binary delay label — **target variable, never input** |
| `evalShippingDate` | `shipping date (DateOrders)` | ISO-8601 string | Actual ship timestamp — **post-outcome evaluation only** |

---

## 4. Synthetic Procurement Schema (`data/processed/synthetic_procurement/`)

Generated deterministically using `seed=20261112`:
- `Supplier` (`18` vendors): `supplierCode` (`SYN-SUP-001`..`018`), `tier`, `homeMarket`, `baseLeadTimeDays`, `reliabilityScore`, `isSyntheticFlagship`.
- `Warehouse` (`8` hubs): `warehouseCode` (`SYN-WH-001`..`008`), `market`, `capacityUnits`, linked to DataCo `Region`.
- `Inventory` (`236` SKU-warehouse slots): `onHandUnits`, `safetyStockUnits`, `reorderPointUnits`, `shortageUnits`, `isShortage`.
- `PurchaseOrder` (`120` POs): `poCode`, `scheduledLeadDays`, `actualLeadDays`, `delayDays`, `isDelayed`, `delaySeverity`, `delayCause`, `totalOrderCost`.

