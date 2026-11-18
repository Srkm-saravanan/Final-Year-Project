from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.models import ExtractedGraphBundle


def _chunked(items: list[dict[str, Any]], size: int = 5000) -> Iterable[list[dict[str, Any]]]:
    for i in range(0, len(items), size):
        yield items[i : i + size]


def _run_batch(
    client: Neo4jClient,
    cypher: str,
    rows: list[dict[str, Any]],
    batch_size: int = 5000,
) -> int:
    if not rows:
        return 0
    total = 0
    with client.session() as sess:
        for chunk in _chunked(rows, batch_size):
            sess.run(cypher, rows=chunk).consume()
            total += len(chunk)
    return total


def ingest_bundle_to_neo4j(
    client: Neo4jClient,
    bundle: ExtractedGraphBundle,
    batch_size: int = 5000,
) -> dict[str, Any]:
    """Batch idempotent UNWIND/MERGE upsert of all canonical nodes & relationships."""
    client.ensure_schema()
    nodes_written: dict[str, int] = {}
    rels_written: dict[str, int] = {}

    # 1. Departments
    nodes_written["Department"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Department:CortexEntity {entityId: row.entity_id})
        SET n.departmentCode = row.department_code,
            n.name = row.name,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.departments],
        batch_size,
    )

    # 2. ProductCategories + BELONGS_TO -> Department
    nodes_written["ProductCategory"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:ProductCategory:CortexEntity {entityId: row.entity_id})
        SET n.categoryCode = row.category_code,
            n.name = row.name,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.categories],
        batch_size,
    )
    rels_written["BELONGS_TO_DEPT"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (c:ProductCategory {entityId: row.entity_id})
        MATCH (d:Department {entityId: row.department_entity_id})
        MERGE (c)-[r:BELONGS_TO]->(d)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + '->' + row.department_entity_id,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.categories],
        batch_size,
    )

    # 3. Products + BELONGS_TO -> ProductCategory
    nodes_written["Product"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Product:CortexEntity {entityId: row.entity_id})
        SET n.productCode = row.product_code,
            n.name = row.name,
            n.unitPrice = row.unit_price,
            n.productStatus = row.product_status,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.products],
        batch_size,
    )
    rels_written["BELONGS_TO_CATEGORY"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (p:Product {entityId: row.entity_id})
        MATCH (c:ProductCategory {entityId: row.category_entity_id})
        MERGE (p)-[r:BELONGS_TO]->(c)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + '->' + row.category_entity_id,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.products],
        batch_size,
    )

    # 4. Regions & CustomerSegments
    nodes_written["Region"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Region:CortexEntity {entityId: row.entity_id})
        SET n.market = row.market,
            n.regionName = row.region_name,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.regions],
        batch_size,
    )
    nodes_written["CustomerSegment"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:CustomerSegment:CortexEntity {entityId: row.entity_id})
        SET n.name = row.name,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.customer_segments],
        batch_size,
    )

    # 5. Orders + CustomerSegment -[:PLACED]-> Order
    order_dicts = [m.model_dump(mode="json") for m in bundle.orders]
    nodes_written["Order"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Order:CortexEntity {entityId: row.entity_id})
        SET n.orderCode = row.order_code,
            n.orderDate = row.order_date,
            n.orderStatus = row.order_status,
            n.paymentType = row.payment_type,
            n.market = row.market,
            n.orderRegion = row.order_region,
            n.orderCountry = row.order_country,
            n.orderCity = row.order_city,
            n.totalSales = row.total_sales,
            n.totalProfit = row.total_profit,
            n.itemCount = row.item_count,
            n.hasLossItem = row.has_loss_item,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        order_dicts,
        batch_size,
    )
    rels_written["SEGMENT_PLACED_ORDER"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (s:CustomerSegment {entityId: row.customer_segment_entity_id})
        MATCH (o:Order {entityId: row.entity_id})
        MERGE (s)-[r:PLACED]->(o)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':PLACED',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        order_dicts,
        batch_size,
    )

    # 6. Shipments + Order -[:SHIPPED_VIA]-> Shipment + Shipment -[:DELIVERED_TO]-> Region
    shipment_dicts = [m.model_dump(mode="json") for m in bundle.shipments]
    nodes_written["Shipment"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Shipment:CortexEntity {entityId: row.entity_id})
        SET n.shipmentCode = row.shipment_code,
            n.shippingMode = row.shipping_mode,
            n.scheduledShippingDays = row.scheduled_shipping_days,
            n.evalRealShippingDays = row.eval_real_shipping_days,
            n.evalDeliveryStatus = row.eval_delivery_status,
            n.evalLateDeliveryRisk = row.eval_late_delivery_risk,
            n.evalShippingDate = row.eval_shipping_date,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        shipment_dicts,
        batch_size,
    )
    rels_written["ORDER_SHIPPED_VIA"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (o:Order {entityId: row.order_entity_id})
        MATCH (sh:Shipment {entityId: row.entity_id})
        MERGE (o)-[r:SHIPPED_VIA]->(sh)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':SHIPPED_VIA',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        shipment_dicts,
        batch_size,
    )
    rels_written["SHIPMENT_DELIVERED_TO"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (sh:Shipment {entityId: row.entity_id})
        MATCH (rg:Region {entityId: row.region_entity_id})
        MERGE (sh)-[r:DELIVERED_TO]->(rg)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':DELIVERED_TO',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        shipment_dicts,
        batch_size,
    )

    # 7. Order -[:CONTAINS]-> Product (lossless OrderItem relationship keyed on sourceRecordId)
    rels_written["ORDER_CONTAINS_PRODUCT"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (o:Order {entityId: row.order_entity_id})
        MATCH (p:Product {entityId: row.product_entity_id})
        MERGE (o)-[r:CONTAINS {sourceRecordId: row.source_record_id}]->(p)
        SET r.quantity = row.quantity,
            r.unitPrice = row.unit_price,
            r.discountRate = row.discount_rate,
            r.sales = row.sales,
            r.orderItemTotal = row.order_item_total,
            r.profitPerOrder = row.profit_per_order,
            r.isProfitOutlier = row.is_profit_outlier,
            r.sourceDataset = row.source_dataset,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.order_items],
        batch_size,
    )

    # 8. Synthetic Procurement Layer (Suppliers, Warehouses, Inventory, PurchaseOrders, Delays, Impacts)
    nodes_written["Supplier"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Supplier:CortexEntity {entityId: row.entity_id})
        SET n.supplierCode = row.supplier_code,
            n.name = row.name,
            n.tier = row.tier,
            n.homeMarket = row.home_market,
            n.baseLeadTimeDays = row.base_lead_time_days,
            n.reliabilityScore = row.reliability_score,
            n.isSyntheticFlagship = row.is_synthetic_flagship,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.suppliers],
        batch_size,
    )
    rels_written["SUPPLIER_SUPPLIES_PRODUCT"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (s:Supplier {entityId: row.supplier_entity_id})
        MATCH (p:Product {entityId: row.product_entity_id})
        MERGE (s)-[r:SUPPLIES]->(p)
        SET r.contractUnitCost = row.contract_unit_cost,
            r.contractLeadTimeDays = row.contract_lead_time_days,
            r.isPrimarySupplier = row.is_primary_supplier,
            r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.supplier_products],
        batch_size,
    )

    wh_dicts = [m.model_dump(mode="json") for m in bundle.warehouses]
    nodes_written["Warehouse"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Warehouse:CortexEntity {entityId: row.entity_id})
        SET n.warehouseCode = row.warehouse_code,
            n.name = row.name,
            n.market = row.market,
            n.capacityUnits = row.capacity_units,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        wh_dicts,
        batch_size,
    )
    rels_written["WAREHOUSE_BELONGS_TO_REGION"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (w:Warehouse {entityId: row.entity_id})
        MATCH (rg:Region {entityId: row.region_entity_id})
        MERGE (w)-[r:BELONGS_TO]->(rg)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':REGION',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        wh_dicts,
        batch_size,
    )

    inv_dicts = [m.model_dump(mode="json") for m in bundle.inventory]
    nodes_written["Inventory"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Inventory:CortexEntity {entityId: row.entity_id})
        SET n.onHandUnits = row.on_hand_units,
            n.safetyStockUnits = row.safety_stock_units,
            n.reorderPointUnits = row.reorder_point_units,
            n.shortageUnits = row.shortage_units,
            n.isShortage = row.is_shortage,
            n.lastUpdated = row.last_updated,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        inv_dicts,
        batch_size,
    )
    rels_written["WAREHOUSE_HAS_INVENTORY"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (w:Warehouse {entityId: row.warehouse_entity_id})
        MATCH (inv:Inventory {entityId: row.entity_id})
        MERGE (w)-[r:HAS_INVENTORY]->(inv)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':WH',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        inv_dicts,
        batch_size,
    )
    rels_written["INVENTORY_BELONGS_TO_PRODUCT"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (inv:Inventory {entityId: row.entity_id})
        MATCH (p:Product {entityId: row.product_entity_id})
        MERGE (inv)-[r:BELONGS_TO]->(p)
        SET r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':PROD',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        inv_dicts,
        batch_size,
    )
    rels_written["PRODUCT_STORED_AT_WAREHOUSE"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (p:Product {entityId: row.product_entity_id})
        MATCH (w:Warehouse {entityId: row.warehouse_entity_id})
        MERGE (p)-[r:STORED_AT]->(w)
        SET r.onHandUnits = row.on_hand_units,
            r.isShortage = row.is_shortage,
            r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':STORED_AT',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        inv_dicts,
        batch_size,
    )

    po_dicts = [m.model_dump(mode="json") for m in bundle.purchase_orders]
    nodes_written["PurchaseOrder"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:PurchaseOrder:CortexEntity {entityId: row.entity_id})
        SET n.poCode = row.po_code,
            n.orderDate = row.order_date,
            n.expectedDeliveryDate = row.expected_delivery_date,
            n.scheduledLeadDays = row.scheduled_lead_days,
            n.actualLeadDays = row.actual_lead_days,
            n.delayDays = row.delay_days,
            n.isDelayed = row.is_delayed,
            n.delaySeverity = row.delay_severity,
            n.delayCause = row.delay_cause,
            n.status = row.status,
            n.totalOrderCost = row.total_order_cost,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        po_dicts,
        batch_size,
    )
    # Remove legacy overloaded (PurchaseOrder)-[:PLACED]->(Supplier) links idempotently without wiping graph nodes
    with client.session() as sess:
        sess.run("MATCH (:PurchaseOrder)-[r:PLACED]->(:Supplier) DELETE r").consume()

    rels_written["PO_ORDERED_FROM_SUPPLIER"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (po:PurchaseOrder {entityId: row.entity_id})
        MATCH (s:Supplier {entityId: row.supplier_entity_id})
        MERGE (po)-[r:ORDERED_FROM {sourceRecordId: row.source_record_id + ':ORDERED_FROM'}]->(s)
        SET r.sourceDataset = row.source_dataset,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        po_dicts,
        batch_size,
    )
    rels_written["PO_DELIVERS_TO_WAREHOUSE"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (po:PurchaseOrder {entityId: row.entity_id})
        MATCH (w:Warehouse {entityId: row.warehouse_entity_id})
        MERGE (po)-[r:DELIVERS_TO {sourceRecordId: row.source_record_id + ':DELIVERS_TO'}]->(w)
        SET r.sourceDataset = row.source_dataset,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        po_dicts,
        batch_size,
    )
    rels_written["PO_CONTAINS_PRODUCT"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (po:PurchaseOrder {entityId: row.po_entity_id})
        MATCH (p:Product {entityId: row.product_entity_id})
        MERGE (po)-[r:CONTAINS {sourceRecordId: row.source_record_id}]->(p)
        SET r.orderedUnits = row.ordered_units,
            r.unitCost = row.unit_cost,
            r.lineCost = row.line_cost,
            r.sourceDataset = row.source_dataset,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.po_items],
        batch_size,
    )
    delayed_pos = [row for row in po_dicts if row.get("is_delayed")]
    rels_written["SUPPLIER_HAS_DELAY_PO"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (s:Supplier {entityId: row.supplier_entity_id})
        MATCH (po:PurchaseOrder {entityId: row.entity_id})
        MERGE (s)-[r:HAS_DELAY]->(po)
        SET r.delayDays = row.delay_days,
            r.delaySeverity = row.delay_severity,
            r.delayCause = row.delay_cause,
            r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id + ':HAS_DELAY',
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        delayed_pos,
        batch_size,
    )
    rels_written["PO_AFFECTS_INVENTORY"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (po:PurchaseOrder {entityId: row.po_entity_id})
        MATCH (inv:Inventory {entityId: row.inventory_entity_id})
        MERGE (po)-[r:AFFECTS]->(inv)
        SET r.projectedShortageImpactUnits = row.projected_shortage_impact_units,
            r.delayDays = row.delay_days,
            r.sourceDataset = row.source_dataset,
            r.sourceRecordId = row.source_record_id,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.po_inventory_impacts],
        batch_size,
    )

    # 9. Unstructured Documents (Metadata only in Phase D1)
    nodes_written["Document"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:Document:CortexEntity {entityId: row.entity_id})
        SET n.title = row.title,
            n.docType = row.doc_type,
            n.sourcePath = row.source_path,
            n.sha256 = row.sha256,
            n.chunkCount = row.chunk_count,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.documents],
        batch_size,
    )

    # 10. Demonstration Mock Data (Strictly isolated with dataOrigin='demonstration')
    nodes_written["DemoEntity"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MERGE (n:DemoEntity:CortexEntity {entityId: row.entity_id})
        SET n.originalId = row.original_id,
            n.label = row.label,
            n.nodeType = row.node_type,
            n.category = row.category,
            n.description = row.description,
            n.sourceDataset = row.source_dataset,
            n.sourceRecordId = row.source_record_id,
            n.dataOrigin = row.data_origin,
            n.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.demo_nodes],
        batch_size,
    )
    rels_written["DEMO_REL"] = _run_batch(
        client,
        """
        UNWIND $rows AS row
        MATCH (a:DemoEntity {entityId: row.source_entity_id})
        MATCH (b:DemoEntity {entityId: row.target_entity_id})
        MERGE (a)-[r:DEMO_REL {sourceRecordId: row.source_record_id}]->(b)
        SET r.relationship = row.relationship,
            r.sourceDataset = row.source_dataset,
            r.dataOrigin = row.data_origin,
            r.ingestionJobId = row.ingestion_job_id
        """,
        [m.model_dump(mode="json") for m in bundle.demo_rels],
        batch_size,
    )

    return {
        "nodes_processed": nodes_written,
        "relationships_processed": rels_written,
    }


def validate_graph_integrity(client: Neo4jClient) -> dict[str, Any]:
    """Run integrity assertions on the constructed Neo4j knowledge graph."""
    with client.session() as sess:
        missing_prov_nodes = sess.run(
            """
            MATCH (n:CortexEntity)
            WHERE n.dataOrigin IS NULL OR n.sourceDataset IS NULL OR n.ingestionJobId IS NULL OR n.sourceRecordId IS NULL
            RETURN count(n) AS cnt
            """
        ).single()["cnt"]

        missing_prov_rels = sess.run(
            """
            MATCH ()-[r]->()
            WHERE r.dataOrigin IS NULL OR r.sourceDataset IS NULL OR r.ingestionJobId IS NULL OR r.sourceRecordId IS NULL
            RETURN count(r) AS cnt
            """
        ).single()["cnt"]

        dup_ids = sess.run(
            """
            MATCH (n:CortexEntity)
            WITH n.entityId AS id, count(n) AS c
            WHERE c > 1
            RETURN count(*) AS cnt
            """
        ).single()["cnt"]

        pos_without_warehouse = sess.run(
            """
            MATCH (po:PurchaseOrder)
            WHERE NOT (po)-[:DELIVERS_TO]->(:Warehouse)
            RETURN count(po) AS cnt
            """
        ).single()["cnt"]

        # Central research use case dependency foundation check
        flagship_trace = sess.run(
            """
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
                   round(coalesce(sum(ci.profitPerOrder), 0), 2) AS linkedOrderProfitUsd
            """
        ).single()

    return {
        "missing_provenance_nodes": int(missing_prov_nodes),
        "missing_provenance_relationships": int(missing_prov_rels),
        "duplicate_entity_ids": int(dup_ids),
        "purchase_orders_without_warehouse": int(pos_without_warehouse),
        "integrity_passed": (
            int(missing_prov_nodes) == 0
            and int(missing_prov_rels) == 0
            and int(dup_ids) == 0
            and int(pos_without_warehouse) == 0
        ),
        "central_use_case_foundation": dict(flagship_trace) if flagship_trace else {},
    }

