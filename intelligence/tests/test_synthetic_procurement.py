from __future__ import annotations

from pathlib import Path

from cortex_intelligence.config import Settings
from cortex_intelligence.generators.synthetic_procurement import generate_synthetic_procurement
from cortex_intelligence.pipeline.cleaning import clean_dataco_csv
from cortex_intelligence.pipeline.extraction import extract_canonical_graph_bundle
from cortex_intelligence.pipeline.validation import validate_csv_source


def test_synthetic_procurement_fixed_seed_deterministic_and_use_case_complete(
    isolated_settings: Settings, tmp_path: Path
) -> None:
    sample_csv = isolated_settings.samples_dir / "dataco_sample.csv"
    val = validate_csv_source(sample_csv)
    cleaned = clean_dataco_csv(sample_csv, encoding=val.encoding)

    base_bundle = extract_canonical_graph_bundle(
        cleaned_rows=cleaned.rows,
        ingestion_job_id="job-seed-check",
        synthetic_seed=20261112,
        include_demonstration=False,
        include_synthetic=False,
    )

    syn_a = generate_synthetic_procurement(
        products=base_bundle.products,
        regions=base_bundle.regions,
        seed=20261112,
        ingestion_job_id="job-seed-a",
        export_dir=tmp_path / "export_a",
    )
    syn_b = generate_synthetic_procurement(
        products=base_bundle.products,
        regions=base_bundle.regions,
        seed=20261112,
        ingestion_job_id="job-seed-b",
        export_dir=tmp_path / "export_b",
    )

    assert len(syn_a.suppliers) == 18
    assert len(syn_a.warehouses) == 8
    assert [s.entity_id for s in syn_a.suppliers] == [s.entity_id for s in syn_b.suppliers]
    assert [po.delay_days for po in syn_a.purchase_orders] == [
        po.delay_days for po in syn_b.purchase_orders
    ]
    assert [inv.on_hand_units for inv in syn_a.inventory] == [
        inv.on_hand_units for inv in syn_b.inventory
    ]

    # Verify strict synthetic provenance and SYN-SUP-001 central delay impact chain
    assert all(s.data_origin.value == "synthetic" for s in syn_a.suppliers)
    sup_001 = next(s for s in syn_a.suppliers if s.supplier_code == "SYN-SUP-001")
    assert sup_001.entity_id == "syn:supplier:SYN-SUP-001"
    sup_001_pos = [po for po in syn_a.purchase_orders if po.supplier_entity_id == sup_001.entity_id]
    assert any(po.is_delayed and po.delay_days > 0 for po in sup_001_pos)

    delayed_po_ids = {po.entity_id for po in sup_001_pos if po.is_delayed}
    impacts = [imp for imp in syn_a.po_inventory_impacts if imp.po_entity_id in delayed_po_ids]
    assert len(impacts) > 0
    assert all(imp.delay_days > 0 for imp in impacts)
    assert (tmp_path / "export_a" / "manifest.json").exists()
