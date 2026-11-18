from __future__ import annotations

ENTITY_LABELS = (
    "CortexEntity",
    "Department",
    "ProductCategory",
    "Product",
    "Region",
    "CustomerSegment",
    "Order",
    "Shipment",
    "Supplier",
    "Warehouse",
    "Inventory",
    "PurchaseOrder",
    "Document",
    "DocumentChunk",
    "DemoEntity",
)

CONSTRAINT_STATEMENTS: list[str] = [
    f"CREATE CONSTRAINT cortex_{label.lower()}_entity_id_unique IF NOT EXISTS "
    f"FOR (n:{label}) REQUIRE n.entityId IS UNIQUE"
    for label in ENTITY_LABELS
]

INDEX_STATEMENTS: list[str] = [
    "CREATE INDEX cortex_entity_data_origin_idx IF NOT EXISTS FOR (n:CortexEntity) ON (n.dataOrigin)",
    "CREATE INDEX cortex_entity_source_dataset_idx IF NOT EXISTS FOR (n:CortexEntity) ON (n.sourceDataset)",
    "CREATE INDEX cortex_order_date_idx IF NOT EXISTS FOR (n:Order) ON (n.orderDate)",
    "CREATE INDEX cortex_order_status_idx IF NOT EXISTS FOR (n:Order) ON (n.orderStatus)",
    "CREATE INDEX cortex_shipment_late_eval_idx IF NOT EXISTS FOR (n:Shipment) ON (n.evalLateDeliveryRisk)",
    "CREATE INDEX cortex_po_delayed_idx IF NOT EXISTS FOR (n:PurchaseOrder) ON (n.isDelayed)",
    "CREATE INDEX cortex_inventory_shortage_idx IF NOT EXISTS FOR (n:Inventory) ON (n.isShortage)",
    "CREATE INDEX cortex_product_code_idx IF NOT EXISTS FOR (n:Product) ON (n.productCode)",
    "CREATE INDEX cortex_supplier_code_idx IF NOT EXISTS FOR (n:Supplier) ON (n.supplierCode)",
]

