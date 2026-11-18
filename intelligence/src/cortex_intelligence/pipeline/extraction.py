from __future__ import annotations

import collections
from decimal import Decimal
from pathlib import Path

from cortex_intelligence.adapters.mock_cortex import load_demonstration_graph
from cortex_intelligence.generators.synthetic_procurement import generate_synthetic_procurement
from cortex_intelligence.models import (
    CustomerSegmentEntity,
    DataOrigin,
    DepartmentEntity,
    ExtractedGraphBundle,
    OrderContainsProductRel,
    OrderEntity,
    ProductCategoryEntity,
    ProductEntity,
    RegionEntity,
    ShipmentEntity,
)
from cortex_intelligence.pipeline.cleaning import CleanedOrderItemRow
from cortex_intelligence.pipeline.unstructured import load_and_chunk_documents


def extract_canonical_graph_bundle(
    cleaned_rows: list[CleanedOrderItemRow],
    ingestion_job_id: str,
    synthetic_seed: int,
    source_dataset: str = "DataCoSupplyChainDataset.csv",
    mock_json_path: Path | None = None,
    document_paths: list[tuple[Path, str, str]] | None = None,
    synthetic_export_dir: Path | None = None,
    include_demonstration: bool = True,
    include_synthetic: bool = True,
) -> ExtractedGraphBundle:
    """Stages 7 & 8: Map cleaned records + synthetic + demo sources to canonical entities & relationships."""
    depts: dict[str, DepartmentEntity] = {}
    cats: dict[str, ProductCategoryEntity] = {}
    prods: dict[str, ProductEntity] = {}
    regions: dict[str, RegionEntity] = {}
    segments: dict[str, CustomerSegmentEntity] = {}
    orders_acc: dict[str, dict[str, object]] = {}
    shipments: dict[str, ShipmentEntity] = {}
    order_items: list[OrderContainsProductRel] = []
    product_demand: collections.Counter[str] = collections.Counter()

    for row in cleaned_rows:
        dept_eid = f"dataco:dept:{row.department_id}"
        if dept_eid not in depts:
            depts[dept_eid] = DepartmentEntity(
                entity_id=dept_eid,
                department_code=row.department_id,
                name=row.department_name,
                source_dataset=source_dataset,
                source_record_id=f"Department:{row.department_id}",
                data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
                ingestion_job_id=ingestion_job_id,
            )

        cat_eid = f"dataco:cat:{row.category_id}"
        if cat_eid not in cats:
            cats[cat_eid] = ProductCategoryEntity(
                entity_id=cat_eid,
                category_code=row.category_id,
                name=row.category_name,
                department_entity_id=dept_eid,
                source_dataset=source_dataset,
                source_record_id=f"Category:{row.category_id}",
                data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
                ingestion_job_id=ingestion_job_id,
            )

        prod_eid = f"dataco:prod:{row.product_id}"
        if prod_eid not in prods:
            prods[prod_eid] = ProductEntity(
                entity_id=prod_eid,
                product_code=row.product_id,
                name=row.product_name,
                unit_price=row.product_price,
                product_status=row.product_status,
                category_entity_id=cat_eid,
                department_entity_id=dept_eid,
                source_dataset=source_dataset,
                source_record_id=f"Product:{row.product_id}",
                data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
                ingestion_job_id=ingestion_job_id,
            )
        product_demand[prod_eid] += row.quantity

        reg_key = f"{row.market}::{row.order_region}"
        reg_eid = f"dataco:region:{reg_key}"
        if reg_eid not in regions:
            regions[reg_eid] = RegionEntity(
                entity_id=reg_eid,
                market=row.market,
                region_name=row.order_region,
                source_dataset=source_dataset,
                source_record_id=f"Region:{reg_key}",
                data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
                ingestion_job_id=ingestion_job_id,
            )

        seg_eid = f"dataco:segment:{row.customer_segment}"
        if seg_eid not in segments:
            segments[seg_eid] = CustomerSegmentEntity(
                entity_id=seg_eid,
                name=row.customer_segment,
                source_dataset=source_dataset,
                source_record_id=f"CustomerSegment:{row.customer_segment}",
                data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
                ingestion_job_id=ingestion_job_id,
            )

        ord_eid = f"dataco:order:{row.order_id}"
        if ord_eid not in orders_acc:
            orders_acc[ord_eid] = {
                "order_code": row.order_id,
                "order_date": row.order_date,
                "order_status": row.order_status,
                "payment_type": row.payment_type,
                "market": row.market,
                "order_region": row.order_region,
                "order_country": row.order_country,
                "order_city": row.order_city,
                "customer_segment_entity_id": seg_eid,
                "region_entity_id": reg_eid,
                "total_sales": Decimal("0"),
                "total_profit": 0.0,
                "item_count": 0,
                "has_loss_item": False,
            }
        acc = orders_acc[ord_eid]
        acc["total_sales"] = acc["total_sales"] + Decimal(str(row.sales))  # type: ignore[operator]
        acc["total_profit"] = round(float(acc["total_profit"]) + row.profit_per_order, 4)  # type: ignore[arg-type]
        acc["item_count"] = int(acc["item_count"]) + 1  # type: ignore[arg-type]
        if row.profit_per_order < 0:
            acc["has_loss_item"] = True

        ship_eid = f"dataco:shipment:{row.order_id}"
        if ship_eid not in shipments:
            shipments[ship_eid] = ShipmentEntity(
                entity_id=ship_eid,
                shipment_code=f"SHIP-{row.order_id}",
                order_entity_id=ord_eid,
                region_entity_id=reg_eid,
                shipping_mode=row.shipping_mode,
                scheduled_shipping_days=row.scheduled_shipping_days,
                eval_real_shipping_days=row.eval_real_shipping_days,
                eval_delivery_status=row.eval_delivery_status,
                eval_late_delivery_risk=row.eval_late_delivery_risk,
                eval_shipping_date=row.eval_shipping_date,
                source_dataset=source_dataset,
                source_record_id=f"Shipment:{row.order_id}",
                data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
                ingestion_job_id=ingestion_job_id,
            )

        order_items.append(
            OrderContainsProductRel(
                order_entity_id=ord_eid,
                product_entity_id=prod_eid,
                quantity=row.quantity,
                unit_price=row.product_price,
                discount_rate=row.discount_rate,
                sales=row.sales,
                order_item_total=row.order_item_total,
                profit_per_order=row.profit_per_order,
                is_profit_outlier=row.is_profit_outlier,
                source_dataset=source_dataset,
                source_record_id=f"OrderItem:{row.source_record_id}",
                data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
                ingestion_job_id=ingestion_job_id,
            )
        )

    orders = [
        OrderEntity(
            entity_id=ord_eid,
            order_code=str(acc["order_code"]),
            order_date=str(acc["order_date"]),
            order_status=str(acc["order_status"]),
            payment_type=str(acc["payment_type"]),
            market=str(acc["market"]),
            order_region=str(acc["order_region"]),
            order_country=str(acc["order_country"]),
            order_city=str(acc["order_city"]),
            customer_segment_entity_id=str(acc["customer_segment_entity_id"]),
            region_entity_id=str(acc["region_entity_id"]),
            total_sales=float(acc["total_sales"]),  # type: ignore[arg-type]
            total_profit=float(acc["total_profit"]),  # type: ignore[arg-type]
            item_count=int(acc["item_count"]),  # type: ignore[arg-type]
            has_loss_item=bool(acc["has_loss_item"]),
            source_dataset=source_dataset,
            source_record_id=f"Order:{acc['order_code']}",
            data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
            ingestion_job_id=ingestion_job_id,
        )
        for ord_eid, acc in orders_acc.items()
    ]

    product_list = list(prods.values())
    region_list = list(regions.values())

    bundle = ExtractedGraphBundle(
        ingestion_job_id=ingestion_job_id,
        departments=list(depts.values()),
        categories=list(cats.values()),
        products=product_list,
        regions=region_list,
        customer_segments=list(segments.values()),
        orders=orders,
        shipments=list(shipments.values()),
        order_items=order_items,
    )

    if include_synthetic and product_list and region_list:
        synth = generate_synthetic_procurement(
            products=product_list,
            regions=region_list,
            seed=synthetic_seed,
            ingestion_job_id=ingestion_job_id,
            product_demand_map=dict(product_demand),
            export_dir=synthetic_export_dir,
        )
        bundle.suppliers = synth.suppliers
        bundle.supplier_products = synth.supplier_products
        bundle.warehouses = synth.warehouses
        bundle.inventory = synth.inventory
        bundle.purchase_orders = synth.purchase_orders
        bundle.po_items = synth.po_items
        bundle.po_inventory_impacts = synth.po_inventory_impacts

    if include_demonstration and mock_json_path is not None:
        demo_nodes, demo_rels = load_demonstration_graph(mock_json_path, ingestion_job_id)
        bundle.demo_nodes = demo_nodes
        bundle.demo_rels = demo_rels

    if document_paths:
        docs, chunks = load_and_chunk_documents(document_paths, ingestion_job_id)
        bundle.documents = docs
        bundle.document_chunks = chunks

    return bundle

