# CORTEX Neo4j Knowledge Graph Schema (`docs/data/neo4j-graph-schema.md`)

Deployed on **Neo4j 5 Community Edition** (`cortex-neo4j` container, database `neo4j`).

---

## 1. Node Labels & Measured Cardinalities

All nodes carry the base label `:CortexEntity` in addition to their domain label, plus mandatory provenance (`entityId`, `sourceDataset`, `sourceRecordId`, `dataOrigin`, `ingestionJobId`).

| Label | Measured Nodes | `dataOrigin` | Key Properties |
| :--- | :---: | :--- | :--- |
| `Order` | `65,752` | `public_open_dataset` | `entityId`, `orderCode`, `orderDate`, `orderStatus`, `paymentType`, `market`, `orderRegion`, `orderCountry`, `orderCity`, `totalSales`, `totalProfit`, `itemCount`, `hasLossItem` |
| `Shipment` | `65,752` | `public_open_dataset` | `entityId`, `shipmentCode`, `shippingMode`, `scheduledShippingDays`, `evalRealShippingDays`, `evalDeliveryStatus`, `evalLateDeliveryRisk`, `evalShippingDate` |
| `Inventory` | `236` | `synthetic` | `entityId`, `onHandUnits`, `safetyStockUnits`, `reorderPointUnits`, `shortageUnits`, `isShortage`, `lastUpdated` |
| `PurchaseOrder` | `120` | `synthetic` | `entityId`, `poCode`, `orderDate`, `expectedDeliveryDate`, `scheduledLeadDays`, `actualLeadDays`, `delayDays`, `isDelayed`, `delaySeverity`, `delayCause`, `status`, `totalOrderCost` |
| `Product` | `118` | `public_open_dataset` | `entityId`, `productCode`, `name`, `unitPrice`, `productStatus` |
| `ProductCategory` | `51` | `public_open_dataset` | `entityId`, `categoryCode`, `name` |
| `Region` | `23` | `public_open_dataset` | `entityId`, `market`, `regionName` |
| `Supplier` | `18` | `synthetic` | `entityId`, `supplierCode`, `name`, `tier`, `homeMarket`, `baseLeadTimeDays`, `reliabilityScore`, `isSyntheticFlagship` |
| `DemoEntity` | `16` | `demonstration` | `entityId`, `originalId`, `label`, `nodeType`, `category`, `description` |
| `Department` | `11` | `public_open_dataset` | `entityId`, `departmentCode`, `name` |
| `Warehouse` | `8` | `synthetic` | `entityId`, `warehouseCode`, `name`, `market`, `capacityUnits` |
| `CustomerSegment` | `3` | `public_open_dataset` | `entityId`, `name` |
| `Document` | `2` | `demonstration` | `entityId`, `title`, `docType`, `sourcePath`, `sha256`, `chunkCount` |
| **Total** | **`132,110`** | *3 origins* | **`0` missing provenance, `0` duplicates** |

---

## 2. Relationship Topology & Measured Counts

| Relationship Type | Direction | Measured Edges | Key Properties |
| :--- | :--- | :---: | :--- |
| `CONTAINS` | `(Order)-[:CONTAINS]->(Product)` (`180,519`) & `(PurchaseOrder)-[:CONTAINS]->(Product)` (`120`, keyed on `{sourceRecordId}`) | `180,639` | `sourceRecordId` (lossless line-item key), `quantity`, `unitPrice`, `discountRate`, `sales`, `orderItemTotal`, `profitPerOrder`, `isProfitOutlier` |
| `PLACED` | `(CustomerSegment)-[:PLACED]->(Order)` *(customer order origin only)* | `65,752` | Provenance fields |
| `DELIVERED_TO` | `(Shipment)-[:DELIVERED_TO]->(Region)` | `65,752` | Provenance fields |
| `SHIPPED_VIA` | `(Order)-[:SHIPPED_VIA]->(Shipment)` | `65,752` | Provenance fields |
| `BELONGS_TO` | `(ProductCategory)->(Department)` (`51`), `(Product)->(ProductCategory)` (`118`), `(Warehouse)->(Region)` (`8`), `(Inventory)->(Product)` (`236`) | `413` | Provenance fields |
| `HAS_INVENTORY` | `(Warehouse)-[:HAS_INVENTORY]->(Inventory)` | `236` | Provenance fields |
| `STORED_AT` | `(Product)-[:STORED_AT]->(Warehouse)` | `236` | `onHandUnits`, `isShortage` |
| `DELIVERS_TO` | `(PurchaseOrder)-[:DELIVERS_TO]->(Warehouse)` *(keyed on `{sourceRecordId}`)* | `120` | Provenance fields |
| `ORDERED_FROM` | `(PurchaseOrder)-[:ORDERED_FROM]->(Supplier)` *(keyed on `{sourceRecordId}`)* | `120` | Provenance fields |
| `SUPPLIES` | `(Supplier)-[:SUPPLIES]->(Product)` | `118` | `contractUnitCost`, `contractLeadTimeDays`, `isPrimarySupplier` |
| `HAS_DELAY` | `(Supplier)-[:HAS_DELAY]->(PurchaseOrder)` *(where `isDelayed=true`)* | `43` | `delayDays`, `delaySeverity`, `delayCause` |
| `AFFECTS` | `(PurchaseOrder)-[:AFFECTS]->(Inventory)` | `43` | `projectedShortageImpactUnits`, `delayDays` |
| `DEMO_REL` | `(DemoEntity)-[:DEMO_REL]->(DemoEntity)` | `16` | `relId`, `relationship` (`dataOrigin="demonstration"`) |
| **Total** | | **`379,240`** | **`0` missing provenance** |

---

## 3. Uniqueness Constraints & Indexes (`graph/schema.py`)

```cypher
// 14 Uniqueness Constraints (enforce idempotent MERGE without duplicate entities)
CREATE CONSTRAINT cortex_cortexentity_entity_id_unique IF NOT EXISTS FOR (n:CortexEntity) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_department_entity_id_unique IF NOT EXISTS FOR (n:Department) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_productcategory_entity_id_unique IF NOT EXISTS FOR (n:ProductCategory) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_product_entity_id_unique IF NOT EXISTS FOR (n:Product) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_region_entity_id_unique IF NOT EXISTS FOR (n:Region) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_customersegment_entity_id_unique IF NOT EXISTS FOR (n:CustomerSegment) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_order_entity_id_unique IF NOT EXISTS FOR (n:Order) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_shipment_entity_id_unique IF NOT EXISTS FOR (n:Shipment) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_supplier_entity_id_unique IF NOT EXISTS FOR (n:Supplier) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_warehouse_entity_id_unique IF NOT EXISTS FOR (n:Warehouse) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_inventory_entity_id_unique IF NOT EXISTS FOR (n:Inventory) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_purchaseorder_entity_id_unique IF NOT EXISTS FOR (n:PurchaseOrder) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_document_entity_id_unique IF NOT EXISTS FOR (n:Document) REQUIRE n.entityId IS UNIQUE;
CREATE CONSTRAINT cortex_demoentity_entity_id_unique IF NOT EXISTS FOR (n:DemoEntity) REQUIRE n.entityId IS UNIQUE;

// 9 Domain Property Indexes (plus 14 constraint-backed RANGE indexes = 23 total ONLINE indexes)
CREATE INDEX cortex_entity_data_origin_idx IF NOT EXISTS FOR (n:CortexEntity) ON (n.dataOrigin);
CREATE INDEX cortex_entity_source_dataset_idx IF NOT EXISTS FOR (n:CortexEntity) ON (n.sourceDataset);
CREATE INDEX cortex_order_date_idx IF NOT EXISTS FOR (n:Order) ON (n.orderDate);
CREATE INDEX cortex_order_status_idx IF NOT EXISTS FOR (n:Order) ON (n.orderStatus);
CREATE INDEX cortex_shipment_late_eval_idx IF NOT EXISTS FOR (n:Shipment) ON (n.evalLateDeliveryRisk);
CREATE INDEX cortex_po_delayed_idx IF NOT EXISTS FOR (n:PurchaseOrder) ON (n.isDelayed);
CREATE INDEX cortex_inventory_shortage_idx IF NOT EXISTS FOR (n:Inventory) ON (n.isShortage);
CREATE INDEX cortex_product_code_idx IF NOT EXISTS FOR (n:Product) ON (n.productCode);
CREATE INDEX cortex_supplier_code_idx IF NOT EXISTS FOR (n:Supplier) ON (n.supplierCode);
```

---

## 4. Representative Central Use Case Verification Query (`SYN-SUP-001`)

Traces multi-hop supplier delay propagation across synthetic procurement entities down to real DataCo products, orders, and shipments:

```cypher
MATCH (s:Supplier {entityId: 'syn:supplier:SYN-SUP-001'})
OPTIONAL MATCH (s)-[:SUPPLIES]->(p:Product)
WITH s, collect(DISTINCT p) AS products
OPTIONAL MATCH (s)-[:HAS_DELAY]->(po:PurchaseOrder)
WITH s, products, collect(DISTINCT po) AS delayed_pos
UNWIND products AS prod
OPTIONAL MATCH (prod)-[:STORED_AT]->(w:Warehouse)
OPTIONAL MATCH (inv:Inventory)-[:BELONGS_TO]->(prod)
WHERE inv.isShortage = true
WITH s, products, delayed_pos,
     collect(DISTINCT w) AS warehouses,
     collect(DISTINCT inv) AS shortage_invs
UNWIND products AS prod2
OPTIONAL MATCH (o:Order)-[ci:CONTAINS]->(prod2)
OPTIONAL MATCH (o)-[:SHIPPED_VIA]->(sh:Shipment)
RETURN s.entityId AS supplierId,
       size(products) AS dependentProducts,
       size(warehouses) AS holdingWarehouses,
       size(shortage_invs) AS shortageInventorySlots,
       size(delayed_pos) AS delayedPurchaseOrders,
       count(DISTINCT o) AS dependentCustomerOrders,
       count(DISTINCT sh) AS affectedShipments,
       round(coalesce(sum(ci.sales), 0), 2) AS linkedOrderSalesUsd,
       round(coalesce(sum(ci.profitPerOrder), 0), 2) AS linkedOrderProfitUsd;
```

**Observed Live Neo4j Output:**
- `dependentProducts`: `12`
- `holdingWarehouses`: `8`
- `shortageInventorySlots`: `24`
- `delayedPurchaseOrders`: `15`
- `dependentCustomerOrders`: `56,345`
- `affectedShipments`: `56,345`
- `linkedOrderSalesUsd`: `32,576,680.04`
- `linkedOrderProfitUsd`: `3,504,567.57`

