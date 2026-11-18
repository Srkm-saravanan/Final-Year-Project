from __future__ import annotations

import csv
import json
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from cortex_intelligence.acquisition.registry import compute_sha256
from cortex_intelligence.models import (
    DataOrigin,
    InventoryEntity,
    ProductEntity,
    PurchaseOrderAffectsInventoryRel,
    PurchaseOrderContainsRel,
    PurchaseOrderEntity,
    RegionEntity,
    SupplierEntity,
    SupplierSuppliesProductRel,
    WarehouseEntity,
    utc_now_iso,
)

SUPPLIER_TEMPLATES = [
    ("SYN-SUP-001", "Synthetic Vendor 001 (Primary Apparel & Footwear Hub)", "Tier-1", "USCA", 9, 0.78, True),
    ("SYN-SUP-002", "Synthetic Vendor 002 (Sporting Goods Manufacturing)", "Tier-1", "Europe", 10, 0.89, False),
    ("SYN-SUP-003", "Synthetic Vendor 003 (Electronics & Tech Assembly)", "Tier-1", "Pacific Asia", 14, 0.81, False),
    ("SYN-SUP-004", "Synthetic Vendor 004 (Outdoor Equipment Co.)", "Tier-1", "USCA", 8, 0.92, False),
    ("SYN-SUP-005", "Synthetic Vendor 005 (Fan Shop Merchandise)", "Tier-2", "Europe", 11, 0.86, False),
    ("SYN-SUP-006", "Synthetic Vendor 006 (Fitness Gear Supply)", "Tier-2", "Pacific Asia", 12, 0.84, False),
    ("SYN-SUP-007", "Synthetic Vendor 007 (Golf Accessories Mill)", "Tier-2", "USCA", 9, 0.91, False),
    ("SYN-SUP-008", "Synthetic Vendor 008 (Footwear Sole Works)", "Tier-1", "LATAM", 13, 0.80, False),
    ("SYN-SUP-009", "Synthetic Vendor 009 (Health & Wellness Logistics)", "Tier-2", "Europe", 10, 0.88, False),
    ("SYN-SUP-010", "Synthetic Vendor 010 (Media & Books Print Hub)", "Tier-3", "USCA", 7, 0.94, False),
    ("SYN-SUP-011", "Synthetic Vendor 011 (Pet Care Formulations)", "Tier-3", "LATAM", 12, 0.87, False),
    ("SYN-SUP-012", "Synthetic Vendor 012 (Secondary Apparel Reserve)", "Tier-2", "Pacific Asia", 15, 0.79, False),
    ("SYN-SUP-013", "Synthetic Vendor 013 (European Tech Distribution)", "Tier-2", "Europe", 11, 0.90, False),
    ("SYN-SUP-014", "Synthetic Vendor 014 (Americas Athletics Packaging)", "Tier-2", "USCA", 8, 0.93, False),
    ("SYN-SUP-015", "Synthetic Vendor 015 (Continental Footwear Supply)", "Tier-2", "Africa", 16, 0.76, False),
    ("SYN-SUP-016", "Synthetic Vendor 016 (APAC Outdoor Textiles)", "Tier-2", "Pacific Asia", 13, 0.85, False),
    ("SYN-SUP-017", "Synthetic Vendor 017 (Multi-Category Buffer Vendor)", "Tier-3", "Europe", 14, 0.82, False),
    ("SYN-SUP-018", "Synthetic Vendor 018 (Regional Accessories Direct)", "Tier-3", "LATAM", 11, 0.89, False),
]

WAREHOUSE_TEMPLATES = [
    ("SYN-WH-001", "Synthetic Warehouse USCA-West", "USCA", 120000),
    ("SYN-WH-002", "Synthetic Warehouse USCA-East", "USCA", 110000),
    ("SYN-WH-003", "Synthetic Warehouse Europe-Central", "Europe", 105000),
    ("SYN-WH-004", "Synthetic Warehouse Europe-South", "Europe", 85000),
    ("SYN-WH-005", "Synthetic Warehouse LATAM-South", "LATAM", 90000),
    ("SYN-WH-006", "Synthetic Warehouse LATAM-Central", "LATAM", 80000),
    ("SYN-WH-007", "Synthetic Warehouse APAC-East", "Pacific Asia", 115000),
    ("SYN-WH-008", "Synthetic Warehouse Africa-North", "Africa", 65000),
]

DELAY_CAUSES = [
    "Port congestion & customs inspection hold",
    "Upstream raw material allocation shortfall",
    "Carrier capacity constraint on trunk lane",
    "Factory line maintenance & batch QA re-test",
]


@dataclass
class SyntheticProcurementBundle:
    seed: int
    suppliers: list[SupplierEntity]
    supplier_products: list[SupplierSuppliesProductRel]
    warehouses: list[WarehouseEntity]
    inventory: list[InventoryEntity]
    purchase_orders: list[PurchaseOrderEntity]
    po_items: list[PurchaseOrderContainsRel]
    po_inventory_impacts: list[PurchaseOrderAffectsInventoryRel]


def generate_synthetic_procurement(
    products: list[ProductEntity],
    regions: list[RegionEntity],
    seed: int,
    ingestion_job_id: str,
    product_demand_map: dict[str, int] | None = None,
    export_dir: Path | None = None,
) -> SyntheticProcurementBundle:
    """Dataset D: Reproducible fixed-seed synthetic procurement, warehouse, inventory & PO delay data."""
    rng = random.Random(seed)
    source_name = "cortex_synthetic_procurement_generator"
    sorted_products = sorted(products, key=lambda p: int(p.product_code) if p.product_code.isdigit() else 0)
    sorted_regions = sorted(regions, key=lambda r: (r.market, r.region_name))

    # Fallback deterministic region index by market
    region_by_market: dict[str, list[RegionEntity]] = {}
    for reg in sorted_regions:
        region_by_market.setdefault(reg.market, []).append(reg)

    suppliers: list[SupplierEntity] = []
    for idx, (code, name, tier, market, lead, rel, flagship) in enumerate(SUPPLIER_TEMPLATES):
        suppliers.append(
            SupplierEntity(
                entity_id=f"syn:supplier:{code}",
                supplier_code=code,
                name=name,
                tier=tier,
                home_market=market,
                base_lead_time_days=lead,
                reliability_score=rel,
                is_synthetic_flagship=flagship,
                source_dataset=source_name,
                source_record_id=f"{code}:seed={seed}",
                data_origin=DataOrigin.SYNTHETIC,
                ingestion_job_id=ingestion_job_id,
            )
        )

    warehouses: list[WarehouseEntity] = []
    for idx, (wcode, wname, market, cap) in enumerate(WAREHOUSE_TEMPLATES):
        candidates = region_by_market.get(market) or sorted_regions
        chosen_region = candidates[idx % len(candidates)]
        warehouses.append(
            WarehouseEntity(
                entity_id=f"syn:warehouse:{wcode}",
                warehouse_code=wcode,
                name=wname,
                market=market,
                region_entity_id=chosen_region.entity_id,
                capacity_units=cap,
                source_dataset=source_name,
                source_record_id=f"{wcode}:seed={seed}",
                data_origin=DataOrigin.SYNTHETIC,
                ingestion_job_id=ingestion_job_id,
            )
        )

    # Order products deterministically by demand (so highest-demand products anchor flagship SYN-SUP-001)
    demand_scores = product_demand_map or {}
    products_by_demand = sorted(
        sorted_products,
        key=lambda p: (-demand_scores.get(p.entity_id, 0), p.entity_id),
    )

    supplier_products: list[SupplierSuppliesProductRel] = []
    primary_supplier_by_product: dict[str, SupplierEntity] = {}
    for idx, prod in enumerate(products_by_demand):
        # Assign top 12 highest-demand products to SYN-SUP-001 (flagship delay scenario)
        if idx < 12:
            sup = suppliers[0]
        else:
            sup = suppliers[1 + ((idx - 12) % (len(suppliers) - 1))]
        primary_supplier_by_product[prod.entity_id] = sup
        cost_ratio = round(rng.uniform(0.48, 0.68), 3)
        lead_offset = rng.randint(-1, 3)
        supplier_products.append(
            SupplierSuppliesProductRel(
                supplier_entity_id=sup.entity_id,
                product_entity_id=prod.entity_id,
                contract_unit_cost=round(prod.unit_price * cost_ratio, 2),
                contract_lead_time_days=max(3, sup.base_lead_time_days + lead_offset),
                is_primary_supplier=True,
                source_dataset=source_name,
                source_record_id=f"SUPPLIES:{sup.supplier_code}:{prod.product_code}",
                data_origin=DataOrigin.SYNTHETIC,
                ingestion_job_id=ingestion_job_id,
            )
        )

    # Inventory slots: 2 deterministic warehouses per product
    inventory_list: list[InventoryEntity] = []
    inventory_by_product: dict[str, list[InventoryEntity]] = {}
    for p_idx, prod in enumerate(products_by_demand):
        if not warehouses:
            continue
        first_wh_idx = p_idx % len(warehouses)
        second_wh_idx = (p_idx + 3) % len(warehouses)
        chosen_wh_indices = [first_wh_idx] if second_wh_idx == first_wh_idx else [first_wh_idx, second_wh_idx]
        for w_idx in chosen_wh_indices:
            wh = warehouses[w_idx]
            safety = rng.randint(180, 420)
            reorder = int(safety * 1.45)
            # Flagship supplier products receive tight inventory to model realistic exposure
            if p_idx < 12:
                on_hand = rng.randint(int(safety * 0.45), int(safety * 0.95))
            else:
                on_hand = rng.randint(int(safety * 0.8), int(safety * 2.4))
            shortage = max(0, safety - on_hand)
            inv_id = f"syn:inventory:{wh.warehouse_code}:{prod.product_code}"
            inv = InventoryEntity(
                entity_id=inv_id,
                warehouse_entity_id=wh.entity_id,
                product_entity_id=prod.entity_id,
                on_hand_units=on_hand,
                safety_stock_units=safety,
                reorder_point_units=reorder,
                shortage_units=shortage,
                is_shortage=shortage > 0,
                last_updated="2018-01-30T12:00:00",
                source_dataset=source_name,
                source_record_id=f"INV:{wh.warehouse_code}:{prod.product_code}",
                data_origin=DataOrigin.SYNTHETIC,
                ingestion_job_id=ingestion_job_id,
            )
            inventory_list.append(inv)
            inventory_by_product.setdefault(prod.entity_id, []).append(inv)

    # Generate 120 Purchase Orders anchored cleanly to 2018-01 window
    purchase_orders: list[PurchaseOrderEntity] = []
    po_items: list[PurchaseOrderContainsRel] = []
    po_impacts: list[PurchaseOrderAffectsInventoryRel] = []
    base_date = datetime(2018, 1, 5, 9, 0, 0)

    if products_by_demand and warehouses:
        target_po_count = min(120, max(12, len(products_by_demand) * 2))
        for po_idx in range(target_po_count):
            po_num = po_idx + 1
            po_code = f"SYN-PO-{po_num:04d}"
            po_entity_id = f"syn:po:{po_code}"

            # Anchor first 18 POs specifically on flagship delayed supplier SYN-SUP-001
            if po_idx < 18:
                sup = suppliers[0]
                sup_prods = [p for p in products_by_demand if primary_supplier_by_product[p.entity_id].entity_id == sup.entity_id]
                prod = sup_prods[po_idx % len(sup_prods)]
                is_delayed = po_idx < 14
                delay_days = rng.randint(6, 14) if is_delayed else 0
            else:
                prod = products_by_demand[po_idx % len(products_by_demand)]
                sup = primary_supplier_by_product[prod.entity_id]
                is_delayed = rng.random() < 0.24
                delay_days = rng.randint(2, 9) if is_delayed else 0

            inv_choices = inventory_by_product.get(prod.entity_id, [])
            target_inv = inv_choices[po_idx % len(inv_choices)] if inv_choices else None
            wh_entity_id = target_inv.warehouse_entity_id if target_inv else warehouses[po_idx % len(warehouses)].entity_id

            ord_dt = base_date + timedelta(days=po_idx % 24, hours=rng.randint(0, 8))
            sched_lead = sup.base_lead_time_days
            actual_lead = sched_lead + delay_days
            exp_dt = ord_dt + timedelta(days=sched_lead)

            if delay_days >= 10:
                severity = "Critical"
            elif delay_days >= 5:
                severity = "High"
            elif delay_days >= 1:
                severity = "Medium"
            else:
                severity = "None"

            cause = DELAY_CAUSES[po_idx % len(DELAY_CAUSES)] if is_delayed else "On-schedule fulfillment"
            status = "DELAYED" if is_delayed else "CONFIRMED"

            ordered_units = rng.randint(200, 900)
            unit_cost = round(prod.unit_price * 0.58, 2)
            line_cost = round(ordered_units * unit_cost, 2)

            purchase_orders.append(
                PurchaseOrderEntity(
                    entity_id=po_entity_id,
                    po_code=po_code,
                    supplier_entity_id=sup.entity_id,
                    warehouse_entity_id=wh_entity_id,
                    order_date=ord_dt.isoformat(),
                    expected_delivery_date=exp_dt.isoformat(),
                    scheduled_lead_days=sched_lead,
                    actual_lead_days=actual_lead,
                    delay_days=delay_days,
                    is_delayed=is_delayed,
                    delay_severity=severity,
                    delay_cause=cause,
                    status=status,
                    total_order_cost=line_cost,
                    source_dataset=source_name,
                    source_record_id=po_code,
                    data_origin=DataOrigin.SYNTHETIC,
                    ingestion_job_id=ingestion_job_id,
                )
            )
            po_items.append(
                PurchaseOrderContainsRel(
                    po_entity_id=po_entity_id,
                    product_entity_id=prod.entity_id,
                    ordered_units=ordered_units,
                    unit_cost=unit_cost,
                    line_cost=line_cost,
                    source_dataset=source_name,
                    source_record_id=f"{po_code}:ITEM:1",
                    data_origin=DataOrigin.SYNTHETIC,
                    ingestion_job_id=ingestion_job_id,
                )
            )
            if is_delayed and target_inv is not None:
                impact_units = min(ordered_units, max(target_inv.shortage_units, int(target_inv.safety_stock_units * 0.4)))
                po_impacts.append(
                    PurchaseOrderAffectsInventoryRel(
                        po_entity_id=po_entity_id,
                        inventory_entity_id=target_inv.entity_id,
                        projected_shortage_impact_units=impact_units,
                        delay_days=delay_days,
                        source_dataset=source_name,
                        source_record_id=f"{po_code}:AFFECTS:{target_inv.entity_id}",
                        data_origin=DataOrigin.SYNTHETIC,
                        ingestion_job_id=ingestion_job_id,
                    )
                )

    if export_dir is not None:
        _export_synthetic_artifacts(
            export_dir=export_dir,
            seed=seed,
            suppliers=suppliers,
            supplier_products=supplier_products,
            warehouses=warehouses,
            inventory=inventory_list,
            purchase_orders=purchase_orders,
            po_items=po_items,
            po_impacts=po_impacts,
        )

    return SyntheticProcurementBundle(
        seed=seed,
        suppliers=suppliers,
        supplier_products=supplier_products,
        warehouses=warehouses,
        inventory=inventory_list,
        purchase_orders=purchase_orders,
        po_items=po_items,
        po_inventory_impacts=po_impacts,
    )


def _write_models_csv(path: Path, models: list[object]) -> str:
    if not models:
        path.write_text("", encoding="utf-8")
        return compute_sha256(path)
    rows = [m.model_dump(mode="json") for m in models]  # type: ignore[attr-defined]
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return compute_sha256(path)


def _export_synthetic_artifacts(
    export_dir: Path,
    seed: int,
    suppliers: list[SupplierEntity],
    supplier_products: list[SupplierSuppliesProductRel],
    warehouses: list[WarehouseEntity],
    inventory: list[InventoryEntity],
    purchase_orders: list[PurchaseOrderEntity],
    po_items: list[PurchaseOrderContainsRel],
    po_impacts: list[PurchaseOrderAffectsInventoryRel],
) -> None:
    export_dir.mkdir(parents=True, exist_ok=True)
    files = {
        "suppliers.csv": _write_models_csv(export_dir / "suppliers.csv", suppliers),
        "supplier_products.csv": _write_models_csv(export_dir / "supplier_products.csv", supplier_products),
        "warehouses.csv": _write_models_csv(export_dir / "warehouses.csv", warehouses),
        "inventory.csv": _write_models_csv(export_dir / "inventory.csv", inventory),
        "purchase_orders.csv": _write_models_csv(export_dir / "purchase_orders.csv", purchase_orders),
        "po_items.csv": _write_models_csv(export_dir / "po_items.csv", po_items),
        "po_inventory_impacts.csv": _write_models_csv(export_dir / "po_inventory_impacts.csv", po_impacts),
    }
    manifest = {
        "data_origin": DataOrigin.SYNTHETIC.value,
        "random_seed": seed,
        "generated_at": utc_now_iso(),
        "counts": {
            "suppliers": len(suppliers),
            "supplier_products": len(supplier_products),
            "warehouses": len(warehouses),
            "inventory": len(inventory),
            "purchase_orders": len(purchase_orders),
            "delayed_purchase_orders": sum(1 for po in purchase_orders if po.is_delayed),
            "shortage_inventory_slots": sum(1 for inv in inventory if inv.is_shortage),
            "po_inventory_impacts": len(po_impacts),
        },
        "files_sha256": files,
    }
    (export_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

