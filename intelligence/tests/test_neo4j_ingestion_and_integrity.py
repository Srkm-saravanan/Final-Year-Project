from __future__ import annotations

import pytest

from cortex_intelligence.config import Settings
from cortex_intelligence.graph.ingestor import ingest_bundle_to_neo4j, validate_graph_integrity
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.models import (
    DataOrigin,
    DepartmentEntity,
    ExtractedGraphBundle,
    InventoryEntity,
    ProductCategoryEntity,
    ProductEntity,
    PurchaseOrderAffectsInventoryRel,
    PurchaseOrderContainsRel,
    PurchaseOrderEntity,
    RegionEntity,
    SupplierEntity,
    SupplierSuppliesProductRel,
    WarehouseEntity,
)


def _make_isolated_test_bundle(job_id: str) -> ExtractedGraphBundle:
    bundle = ExtractedGraphBundle(ingestion_job_id=job_id)
    origin = DataOrigin.SYNTHETIC
    ds = "pytest_isolated_fixture"

    bundle.departments.append(
        DepartmentEntity(
            entity_id="test:dept:999001",
            department_code="999001",
            name="Test Department",
            source_dataset=ds,
            source_record_id="TestDept:999001",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.categories.append(
        ProductCategoryEntity(
            entity_id="test:category:999002",
            category_code="999002",
            name="Test Category",
            department_entity_id="test:dept:999001",
            source_dataset=ds,
            source_record_id="TestCategory:999002",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.products.append(
        ProductEntity(
            entity_id="test:product:999003",
            product_code="999003",
            name="Test Widget",
            unit_price=42.5,
            product_status="Available",
            category_entity_id="test:category:999002",
            department_entity_id="test:dept:999001",
            source_dataset=ds,
            source_record_id="TestProduct:999003",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.regions.append(
        RegionEntity(
            entity_id="test:region:TESTMARKET:TestRegion",
            market="TESTMARKET",
            region_name="TestRegion",
            source_dataset=ds,
            source_record_id="TestRegion:TestRegion",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.suppliers.append(
        SupplierEntity(
            entity_id="test:supplier:TEST-SUP-001",
            supplier_code="TEST-SUP-001",
            name="Test Supplier 001",
            tier="Tier-1",
            home_market="TESTMARKET",
            base_lead_time_days=9,
            reliability_score=0.78,
            is_synthetic_flagship=True,
            source_dataset=ds,
            source_record_id="TestSupplier:TEST-SUP-001",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.warehouses.append(
        WarehouseEntity(
            entity_id="test:warehouse:TEST-WH-001",
            warehouse_code="TEST-WH-001",
            name="Test Warehouse 001",
            market="TESTMARKET",
            region_entity_id="test:region:TESTMARKET:TestRegion",
            capacity_units=10000,
            source_dataset=ds,
            source_record_id="TestWarehouse:TEST-WH-001",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.inventory.append(
        InventoryEntity(
            entity_id="test:inventory:TEST-WH-001:999003",
            warehouse_entity_id="test:warehouse:TEST-WH-001",
            product_entity_id="test:product:999003",
            on_hand_units=20,
            safety_stock_units=80,
            reorder_point_units=120,
            shortage_units=60,
            is_shortage=True,
            last_updated="2026-10-01T00:00:00",
            source_dataset=ds,
            source_record_id="TestInventory:1",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.supplier_products.append(
        SupplierSuppliesProductRel(
            supplier_entity_id="test:supplier:TEST-SUP-001",
            product_entity_id="test:product:999003",
            contract_unit_cost=25.0,
            contract_lead_time_days=9,
            source_dataset=ds,
            source_record_id="TestSupplies:1",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.purchase_orders.append(
        PurchaseOrderEntity(
            entity_id="test:po:TEST-PO-001",
            po_code="TEST-PO-001",
            supplier_entity_id="test:supplier:TEST-SUP-001",
            warehouse_entity_id="test:warehouse:TEST-WH-001",
            order_date="2026-10-01T00:00:00",
            expected_delivery_date="2026-10-10T00:00:00",
            scheduled_lead_days=9,
            actual_lead_days=15,
            delay_days=6,
            is_delayed=True,
            delay_severity="High",
            delay_cause="Test port hold",
            status="DELAYED",
            total_order_cost=6250.0,
            source_dataset=ds,
            source_record_id="TestPO:TEST-PO-001",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.po_items.append(
        PurchaseOrderContainsRel(
            po_entity_id="test:po:TEST-PO-001",
            product_entity_id="test:product:999003",
            ordered_units=250,
            unit_cost=25.0,
            line_cost=6250.0,
            source_dataset=ds,
            source_record_id="TestPOItem:1",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.po_items.append(
        PurchaseOrderContainsRel(
            po_entity_id="test:po:TEST-PO-001",
            product_entity_id="test:product:999003",
            ordered_units=50,
            unit_cost=25.0,
            line_cost=1250.0,
            source_dataset=ds,
            source_record_id="TestPOItem:2",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    bundle.po_inventory_impacts.append(
        PurchaseOrderAffectsInventoryRel(
            po_entity_id="test:po:TEST-PO-001",
            inventory_entity_id="test:inventory:TEST-WH-001:999003",
            projected_shortage_impact_units=40,
            delay_days=6,
            source_dataset=ds,
            source_record_id="TestPOImpact:1",
            data_origin=origin,
            ingestion_job_id=job_id,
        )
    )
    return bundle


def test_neo4j_constraints_idempotent_upsert_and_integrity(isolated_settings: Settings) -> None:
    client = Neo4jClient(isolated_settings)
    if not client.verify_connectivity().get("connected"):
        client.close()
        pytest.skip("Neo4j service not reachable on configured URI.")

    try:
        client.ensure_schema()
        with client.session() as sess:
            before_nodes = sess.run("MATCH (n:CortexEntity) RETURN count(n) AS c").single()["c"]
            before_rels = sess.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]

        bundle_1 = _make_isolated_test_bundle("job-neo4j-test-1")
        ingest_bundle_to_neo4j(client, bundle_1, batch_size=100)

        with client.session() as sess:
            mid_nodes = sess.run("MATCH (n:CortexEntity) RETURN count(n) AS c").single()["c"]
            mid_rels = sess.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]

        assert mid_nodes == before_nodes + 8
        assert mid_rels == before_rels + 13

        with client.session() as sess:
            delivers_cnt = sess.run(
                "MATCH (:PurchaseOrder {entityId: 'test:po:TEST-PO-001'})-[:DELIVERS_TO]->(:Warehouse {entityId: 'test:warehouse:TEST-WH-001'}) RETURN count(*) AS c"
            ).single()["c"]
            ordered_cnt = sess.run(
                "MATCH (:PurchaseOrder {entityId: 'test:po:TEST-PO-001'})-[:ORDERED_FROM]->(:Supplier {entityId: 'test:supplier:TEST-SUP-001'}) RETURN count(*) AS c"
            ).single()["c"]
            legacy_placed_cnt = sess.run(
                "MATCH (:PurchaseOrder)-[r:PLACED]->(:Supplier) RETURN count(r) AS c"
            ).single()["c"]
        assert delivers_cnt == 1
        assert ordered_cnt == 1
        assert legacy_placed_cnt == 0

        # Repeat ingestion of identical entityIds must not duplicate nodes or relationships
        bundle_2 = _make_isolated_test_bundle("job-neo4j-test-2")
        ingest_bundle_to_neo4j(client, bundle_2, batch_size=100)

        with client.session() as sess:
            after_nodes = sess.run("MATCH (n:CortexEntity) RETURN count(n) AS c").single()["c"]
            after_rels = sess.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]

        assert after_nodes == mid_nodes
        assert after_rels == mid_rels

        integrity = validate_graph_integrity(client)
        assert integrity["integrity_passed"] is True
        assert integrity["missing_provenance_nodes"] == 0
        assert integrity["missing_provenance_relationships"] == 0
        assert integrity["duplicate_entity_ids"] == 0
        assert integrity["purchase_orders_without_warehouse"] == 0
    finally:
        with client.session() as sess:
            sess.run(
                "MATCH (n:CortexEntity) WHERE n.entityId STARTS WITH 'test:' DETACH DELETE n"
            ).consume()
        client.close()
