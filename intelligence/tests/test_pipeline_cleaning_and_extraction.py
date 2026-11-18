from __future__ import annotations

import csv
from pathlib import Path

from cortex_intelligence.config import Settings
from cortex_intelligence.pipeline.cleaning import (
    PII_AND_EXCLUDED_COLUMNS,
    POST_OUTCOME_EVALUATION_FIELDS,
    clean_dataco_csv,
)
from cortex_intelligence.pipeline.extraction import extract_canonical_graph_bundle
from cortex_intelligence.pipeline.unstructured import load_and_chunk_documents
from cortex_intelligence.pipeline.validation import detect_csv_encoding, validate_csv_source


def test_sample_csv_validation_cleaning_and_ml_leakage_separation(isolated_settings: Settings) -> None:
    sample_csv = isolated_settings.samples_dir / "dataco_sample.csv"
    assert sample_csv.exists()

    val = validate_csv_source(sample_csv)
    assert val.valid is True
    assert len(val.headers) == 53

    cleaned = clean_dataco_csv(sample_csv, encoding=val.encoding)
    assert cleaned.stats.total_rows_read == 30
    assert cleaned.stats.accepted_rows == 30
    assert cleaned.stats.rejected_rows == 0
    assert len(cleaned.stats.pii_columns_removed) == len(PII_AND_EXCLUDED_COLUMNS)
    assert list(POST_OUTCOME_EVALUATION_FIELDS) == [
        "Days for shipping (real)",
        "Delivery Status",
        "Late_delivery_risk",
        "shipping date (DateOrders)",
    ]

    # Cleaned rows must not contain any customer PII fields
    first = cleaned.rows[0]
    assert not hasattr(first, "customer_email")
    assert not hasattr(first, "customer_fname")
    assert not hasattr(first, "customer_street")
    assert first.source_record_id.isdigit()


def test_cleaning_trims_whitespace_rejects_duplicates_and_bad_numerics(tmp_path: Path) -> None:
    headers = [
        "Type", "Days for shipping (real)", "Days for shipment (scheduled)",
        "Benefit per order", "Sales per customer", "Delivery Status",
        "Late_delivery_risk", "Category Id", "Category Name", "Customer City",
        "Customer Country", "Customer Email", "Customer Fname", "Customer Id",
        "Customer Lname", "Customer Password", "Customer Segment", "Customer State",
        "Customer Street", "Customer Zipcode", "Department Id", "Department Name",
        "Latitude", "Longitude", "Market", "Order City", "Order Country",
        "Order Customer Id", "order date (DateOrders)", "Order Id",
        "Order Item Cardprod Id", "Order Item Discount", "Order Item Discount Rate",
        "Order Item Id", "Order Item Product Price", "Order Item Profit Ratio",
        "Order Item Quantity", "Sales", "Order Item Total", "Order Profit Per Order",
        "Order Region", "Order State", "Order Status", "Order Zipcode",
        "Product Card Id", "Product Category Id", "Product Description",
        "Product Image", "Product Name", "Product Price", "Product Status",
        "shipping date (DateOrders)", "Shipping Mode",
    ]
    base_row = {h: "0" for h in headers}
    base_row.update({
        "Type": "DEBIT",
        "Days for shipping (real)": "3",
        "Days for shipment (scheduled)": "4",
        "Delivery Status": "Advance shipping",
        "Late_delivery_risk": "0",
        "Category Id": "17",
        "Category Name": "  Cleats   ",
        "Customer Email": "pii@secret.local",
        "Customer Segment": "Consumer",
        "Department Id": "4",
        "Department Name": " Apparel ",
        "Market": "USCA",
        "Order City": "Bogotá ",
        "Order Country": "United States",
        "order date (DateOrders)": "1/31/2018 22:56",
        "Order Id": "1001",
        "Order Item Id": "5001",
        "Order Item Discount Rate": "0.1",
        "Order Item Product Price": "50.0",
        "Order Item Quantity": "2",
        "Sales": "100.0",
        "Order Item Total": "90.0",
        "Order Profit Per Order": "-12.50",
        "Order Region": "US Center",
        "Order Status": "COMPLETE",
        "Product Card Id": "365",
        "Product Name": "Perfect Fitness Rip Deck",
        "Product Price": "50.0",
        "Product Status": "0",
        "shipping date (DateOrders)": "2/3/2018 22:56",
        "Shipping Mode": "Standard Class",
    })
    dup_row = dict(base_row)
    bad_row = dict(base_row, **{"Order Item Id": "5002", "Order Item Quantity": "-5"})

    csv_path = tmp_path / "latin1_edge.csv"
    with csv_path.open("w", encoding="latin-1", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=headers)
        w.writeheader()
        w.writerow(base_row)
        w.writerow(dup_row)
        w.writerow(bad_row)

    detected = detect_csv_encoding(csv_path)
    assert detected in ("cp1252", "latin-1")
    cleaned = clean_dataco_csv(csv_path, encoding=detected)
    assert cleaned.stats.total_rows_read == 3
    assert cleaned.stats.accepted_rows == 1
    assert cleaned.stats.duplicate_rows_rejected == 1
    assert cleaned.stats.invalid_numeric_rows == 1
    assert cleaned.stats.negative_profit_rows == 1
    assert cleaned.rows[0].department_name == "Apparel"
    assert cleaned.rows[0].category_name == "Cleats"
    assert cleaned.rows[0].order_city == "Bogotá"
    assert cleaned.rows[0].profit_per_order == -12.5


def test_sales_full_precision_preserved_without_4dp_drift(tmp_path: Path) -> None:
    headers = [
        "Type", "Days for shipping (real)", "Days for shipment (scheduled)",
        "Benefit per order", "Sales per customer", "Delivery Status",
        "Late_delivery_risk", "Category Id", "Category Name", "Customer City",
        "Customer Country", "Customer Email", "Customer Fname", "Customer Id",
        "Customer Lname", "Customer Password", "Customer Segment", "Customer State",
        "Customer Street", "Customer Zipcode", "Department Id", "Department Name",
        "Latitude", "Longitude", "Market", "Order City", "Order Country",
        "Order Customer Id", "order date (DateOrders)", "Order Id",
        "Order Item Cardprod Id", "Order Item Discount", "Order Item Discount Rate",
        "Order Item Id", "Order Item Product Price", "Order Item Profit Ratio",
        "Order Item Quantity", "Sales", "Order Item Total", "Order Profit Per Order",
        "Order Region", "Order State", "Order Status", "Order Zipcode",
        "Product Card Id", "Product Category Id", "Product Description",
        "Product Image", "Product Name", "Product Price", "Product Status",
        "shipping date (DateOrders)", "Shipping Mode",
    ]
    row = {h: "0" for h in headers}
    row.update({
        "Type": "DEBIT",
        "Days for shipping (real)": "3",
        "Days for shipment (scheduled)": "4",
        "Delivery Status": "Advance shipping",
        "Late_delivery_risk": "0",
        "Category Id": "17",
        "Category Name": "Cleats",
        "Customer Segment": "Consumer",
        "Department Id": "4",
        "Department Name": "Apparel",
        "Market": "USCA",
        "Order City": "Austin",
        "Order Country": "United States",
        "order date (DateOrders)": "1/31/2018 22:56",
        "Order Id": "2001",
        "Order Item Discount Rate": "0.1",
        "Order Item Product Price": "299.98",
        "Order Item Quantity": "1",
        "Sales": "299.980011",
        "Order Item Total": "269.98",
        "Order Profit Per Order": "50.0",
        "Order Region": "US Center",
        "Order Status": "COMPLETE",
        "Product Card Id": "365",
        "Product Name": "Perfect Fitness Rip Deck",
        "Product Price": "299.98",
        "Product Status": "0",
        "shipping date (DateOrders)": "2/3/2018 22:56",
        "Shipping Mode": "Standard Class",
    })
    csv_path = tmp_path / "sales_precision.csv"
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=headers)
        w.writeheader()
        for idx in range(1, 5):
            r = dict(row, **{"Order Item Id": str(idx)})
            w.writerow(r)

    cleaned = clean_dataco_csv(csv_path, encoding="utf-8")
    assert all(r.sales == 299.980011 for r in cleaned.rows)
    bundle = extract_canonical_graph_bundle(
        cleaned_rows=cleaned.rows,
        ingestion_job_id="job-precision-test",
        synthetic_seed=20261112,
        include_demonstration=False,
        include_synthetic=False,
    )
    assert round(bundle.orders[0].total_sales, 6) == round(299.980011 * 4, 6)


def test_canonical_extraction_provenance_and_unstructured_chunker(isolated_settings: Settings) -> None:
    sample_csv = isolated_settings.samples_dir / "dataco_sample.csv"
    val = validate_csv_source(sample_csv)
    cleaned = clean_dataco_csv(sample_csv, encoding=val.encoding)

    bundle = extract_canonical_graph_bundle(
        cleaned_rows=cleaned.rows,
        ingestion_job_id="job-unit-test",
        synthetic_seed=20261112,
        source_dataset="dataco_sample.csv",
        mock_json_path=isolated_settings.project_root / "mock-data.json",
        document_paths=[(isolated_settings.project_root / "README.md", "README", "markdown")],
        synthetic_export_dir=isolated_settings.processed_dir / "synthetic_procurement",
    )

    assert len(bundle.orders) > 0
    assert all(o.data_origin.value == "public_open_dataset" for o in bundle.orders)
    assert all(o.ingestion_job_id == "job-unit-test" for o in bundle.orders)
    assert len(bundle.suppliers) > 0
    assert all(s.data_origin.value == "synthetic" for s in bundle.suppliers)
    assert len(bundle.demo_nodes) > 0
    assert all(d.data_origin.value == "demonstration" for d in bundle.demo_nodes)

    docs, chunks = load_and_chunk_documents(
        [(isolated_settings.project_root / "README.md", "README", "markdown")],
        ingestion_job_id="job-unit-test",
    )
    assert len(docs) == 1
    assert len(chunks) >= 1
    assert all(len(c.sha256) == 64 for c in chunks)
