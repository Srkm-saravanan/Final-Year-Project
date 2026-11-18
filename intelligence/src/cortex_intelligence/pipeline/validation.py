from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from cortex_intelligence.acquisition.registry import compute_sha256

REQUIRED_DATACO_COLUMNS = {
    "Type",
    "Days for shipping (real)",
    "Days for shipment (scheduled)",
    "Benefit per order",
    "Sales per customer",
    "Delivery Status",
    "Late_delivery_risk",
    "Category Id",
    "Category Name",
    "Customer Segment",
    "Department Id",
    "Department Name",
    "Market",
    "Order City",
    "Order Country",
    "order date (DateOrders)",
    "Order Id",
    "Order Item Discount",
    "Order Item Discount Rate",
    "Order Item Id",
    "Order Item Product Price",
    "Order Item Quantity",
    "Sales",
    "Order Item Total",
    "Order Profit Per Order",
    "Order Region",
    "Order Status",
    "Product Card Id",
    "Product Category Id",
    "Product Name",
    "Product Price",
    "Product Status",
    "shipping date (DateOrders)",
    "Shipping Mode",
}


@dataclass(frozen=True)
class ValidationResult:
    valid: bool
    path: Path
    file_size_bytes: int
    sha256: str
    encoding: str
    headers: list[str]
    missing_required_columns: list[str]
    undocumented_columns: list[str]
    error: str | None = None


def detect_csv_encoding(file_path: Path) -> str:
    raw_head = file_path.read_bytes()[:262144]
    if b"\x00" in raw_head:
        raise ValueError(f"Binary null byte detected in CSV candidate: {file_path}")
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            with file_path.open("r", encoding=enc, newline="") as fh:
                # Scan chunks cleanly to verify full-file decodability
                while fh.read(1024 * 1024):
                    pass
            return enc
        except UnicodeDecodeError:
            continue
    raise ValueError(f"Unable to decode {file_path} using supported encodings")


def load_dictionary_fields(dict_csv_path: Path | None) -> set[str]:
    if dict_csv_path is None or not dict_csv_path.exists():
        return set()
    fields: set[str] = set()
    with dict_csv_path.open("r", encoding="latin-1", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            name = (row.get("FIELDS") or "").strip()
            if name:
                fields.add(name)
    return fields


def validate_csv_source(
    csv_path: Path,
    dictionary_csv_path: Path | None = None,
    expected_sha256: str | None = None,
) -> ValidationResult:
    """Stage 2: Validate file presence, non-binary CSV readability, checksum, and headers."""
    if not csv_path.exists() or not csv_path.is_file():
        return ValidationResult(
            valid=False,
            path=csv_path,
            file_size_bytes=0,
            sha256="",
            encoding="",
            headers=[],
            missing_required_columns=sorted(REQUIRED_DATACO_COLUMNS),
            undocumented_columns=[],
            error=f"File not found: {csv_path}",
        )

    size = csv_path.stat().st_size
    if size == 0:
        return ValidationResult(
            valid=False,
            path=csv_path,
            file_size_bytes=0,
            sha256="",
            encoding="",
            headers=[],
            missing_required_columns=sorted(REQUIRED_DATACO_COLUMNS),
            undocumented_columns=[],
            error="Empty CSV file",
        )

    sha = compute_sha256(csv_path)
    if expected_sha256 and sha.lower() != expected_sha256.lower():
        return ValidationResult(
            valid=False,
            path=csv_path,
            file_size_bytes=size,
            sha256=sha,
            encoding="",
            headers=[],
            missing_required_columns=[],
            undocumented_columns=[],
            error=f"SHA-256 mismatch: expected={expected_sha256}, actual={sha}",
        )

    encoding = detect_csv_encoding(csv_path)
    with csv_path.open("r", encoding=encoding, newline="") as fh:
        reader = csv.reader(fh)
        headers = [h.strip() for h in next(reader, [])]

    if not headers:
        return ValidationResult(
            valid=False,
            path=csv_path,
            file_size_bytes=size,
            sha256=sha,
            encoding=encoding,
            headers=[],
            missing_required_columns=sorted(REQUIRED_DATACO_COLUMNS),
            undocumented_columns=[],
            error="CSV header row is missing",
        )

    header_set = set(headers)
    missing = sorted(REQUIRED_DATACO_COLUMNS - header_set)
    dict_fields = load_dictionary_fields(dictionary_csv_path)
    undocumented = sorted(header_set - dict_fields) if dict_fields else []

    return ValidationResult(
        valid=len(missing) == 0,
        path=csv_path,
        file_size_bytes=size,
        sha256=sha,
        encoding=encoding,
        headers=headers,
        missing_required_columns=missing,
        undocumented_columns=undocumented,
        error=f"Missing required columns: {missing}" if missing else None,
    )

