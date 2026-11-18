from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from cortex_intelligence.models import CleaningStats, RejectedRecordSample
from cortex_intelligence.pipeline.validation import detect_csv_encoding

PII_AND_EXCLUDED_COLUMNS = (
    "Customer Email",
    "Customer Fname",
    "Customer Lname",
    "Customer Password",
    "Customer Street",
    "Customer Zipcode",
    "Customer City",
    "Customer State",
    "Customer Country",
    "Customer Id",
    "Order Customer Id",
    "Order Zipcode",
    "Product Image",
    "Latitude",
    "Longitude",
)

# Fields strictly separated as post-outcome evaluation labels (never ML prediction inputs)
POST_OUTCOME_EVALUATION_FIELDS = (
    "Days for shipping (real)",
    "Delivery Status",
    "Late_delivery_risk",
    "shipping date (DateOrders)",
)

_MULTISPACE_RE = re.compile(r"\s+")
_DATE_FORMATS = ("%m/%d/%Y %H:%M", "%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d")


@dataclass(frozen=True)
class CleanedOrderItemRow:
    source_record_id: str
    order_id: str
    order_date: str
    order_status: str
    payment_type: str
    customer_segment: str
    market: str
    order_region: str
    order_country: str
    order_city: str
    department_id: str
    department_name: str
    category_id: str
    category_name: str
    product_id: str
    product_name: str
    product_price: float
    product_status: str
    quantity: int
    discount_rate: float
    sales: float
    order_item_total: float
    profit_per_order: float
    is_profit_outlier: bool
    # ML-safe pre-shipment features
    shipping_mode: str
    scheduled_shipping_days: int
    # Post-outcome evaluation labels ONLY
    eval_real_shipping_days: int
    eval_delivery_status: str
    eval_late_delivery_risk: int
    eval_shipping_date: str | None


@dataclass
class CleaningOutput:
    rows: list[CleanedOrderItemRow]
    stats: CleaningStats


def normalize_text(raw: str | None) -> tuple[str, bool]:
    if raw is None:
        return "", False
    stripped = raw.strip()
    collapsed = _MULTISPACE_RE.sub(" ", stripped)
    return collapsed, collapsed != raw


def parse_iso_timestamp(raw: str | None) -> str | None:
    text, _ = normalize_text(raw)
    if not text:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).isoformat()
        except ValueError:
            continue
    return None


def _parse_int(raw: str | None) -> int | None:
    text, _ = normalize_text(raw)
    if not text:
        return None
    try:
        val = float(text)
        if not val.is_integer():
            return None
        return int(val)
    except ValueError:
        return None


def _parse_float(raw: str | None) -> float | None:
    text, _ = normalize_text(raw)
    if not text:
        return None
    try:
        val = float(text)
        if val != val:  # NaN guard
            return None
        return val
    except ValueError:
        return None


def clean_dataco_csv(
    csv_path: Path,
    encoding: str | None = None,
    undocumented_columns: list[str] | None = None,
) -> CleaningOutput:
    """Stages 5 & 6: Clean, deduplicate, strip PII, normalize UTF-8, and separate ML labels."""
    enc = encoding or detect_csv_encoding(csv_path)
    seen_item_ids: set[str] = set()
    accepted_raw: list[CleanedOrderItemRow] = []
    rejected_samples: list[RejectedRecordSample] = []

    total_rows = 0
    dup_count = 0
    invalid_id_count = 0
    invalid_date_count = 0
    invalid_num_count = 0
    whitespace_trimmed_fields = 0
    neg_profit_count = 0
    headers: list[str] = []
    null_col_counts: dict[str, int] = {}

    def record_reject(row_num: int, rec_id: str, reason: str, detail: str) -> None:
        if len(rejected_samples) < 50:
            rejected_samples.append(
                RejectedRecordSample(
                    row_number=row_num,
                    source_record_id=rec_id or f"row:{row_num}",
                    reason=reason,
                    detail=detail,
                )
            )

    with csv_path.open("r", encoding=enc, newline="") as fh:
        reader = csv.DictReader(fh)
        headers = list(reader.fieldnames or [])
        null_col_counts = {h: 0 for h in headers}

        for row_num, row in enumerate(reader, start=2):
            total_rows += 1
            for h in headers:
                v = row.get(h)
                if v is None or v.strip() == "":
                    null_col_counts[h] += 1

            order_item_id, t1 = normalize_text(row.get("Order Item Id"))
            order_id, t2 = normalize_text(row.get("Order Id"))
            product_id, t3 = normalize_text(row.get("Product Card Id"))
            category_id, t4 = normalize_text(row.get("Category Id"))
            department_id, t5 = normalize_text(row.get("Department Id"))
            if any((t1, t2, t3, t4, t5)):
                whitespace_trimmed_fields += sum((t1, t2, t3, t4, t5))

            if not all((order_item_id, order_id, product_id, category_id, department_id)):
                invalid_id_count += 1
                record_reject(row_num, order_item_id, "invalid_identifier", "Missing core entity ID")
                continue

            if not (
                order_item_id.isdigit()
                and order_id.isdigit()
                and product_id.isdigit()
                and category_id.isdigit()
                and department_id.isdigit()
            ):
                invalid_id_count += 1
                record_reject(
                    row_num, order_item_id, "invalid_identifier", "Non-numeric canonical entity ID"
                )
                continue

            if order_item_id in seen_item_ids:
                dup_count += 1
                record_reject(
                    row_num,
                    order_item_id,
                    "duplicate_order_item_id",
                    f"Duplicate Order Item Id {order_item_id}",
                )
                continue

            order_date = parse_iso_timestamp(row.get("order date (DateOrders)"))
            shipping_date = parse_iso_timestamp(row.get("shipping date (DateOrders)"))
            if order_date is None or shipping_date is None:
                invalid_date_count += 1
                record_reject(
                    row_num, order_item_id, "invalid_date", "Unparseable order or shipping timestamp"
                )
                continue

            product_price = _parse_float(row.get("Product Price"))
            quantity = _parse_int(row.get("Order Item Quantity"))
            discount_rate = _parse_float(row.get("Order Item Discount Rate"))
            sales = _parse_float(row.get("Sales"))
            order_item_total = _parse_float(row.get("Order Item Total"))
            profit_per_order = _parse_float(row.get("Order Profit Per Order"))
            sched_days = _parse_int(row.get("Days for shipment (scheduled)"))
            real_days = _parse_int(row.get("Days for shipping (real)"))
            late_risk = _parse_int(row.get("Late_delivery_risk"))

            if (
                product_price is None
                or product_price <= 0
                or quantity is None
                or quantity <= 0
                or discount_rate is None
                or not (0.0 <= discount_rate <= 1.0)
                or sales is None
                or order_item_total is None
                or profit_per_order is None
                or sched_days is None
                or sched_days < 0
                or real_days is None
                or real_days < 0
                or late_risk not in (0, 1)
            ):
                invalid_num_count += 1
                record_reject(
                    row_num,
                    order_item_id,
                    "invalid_numeric",
                    "Invalid numeric, non-positive quantity/price, or out-of-range metric",
                )
                continue

            order_status, tc1 = normalize_text(row.get("Order Status"))
            payment_type, tc2 = normalize_text(row.get("Type"))
            customer_segment, tc3 = normalize_text(row.get("Customer Segment"))
            market, tc4 = normalize_text(row.get("Market"))
            order_region, tc5 = normalize_text(row.get("Order Region"))
            order_country, tc6 = normalize_text(row.get("Order Country"))
            order_city, tc7 = normalize_text(row.get("Order City"))
            department_name, tc8 = normalize_text(row.get("Department Name"))
            category_name, tc9 = normalize_text(row.get("Category Name"))
            product_name, tc10 = normalize_text(row.get("Product Name"))
            product_status, tc11 = normalize_text(row.get("Product Status"))
            shipping_mode, tc12 = normalize_text(row.get("Shipping Mode"))
            delivery_status, tc13 = normalize_text(row.get("Delivery Status"))

            trimmed_here = sum(
                (tc1, tc2, tc3, tc4, tc5, tc6, tc7, tc8, tc9, tc10, tc11, tc12, tc13)
            )
            whitespace_trimmed_fields += trimmed_here

            if not all((customer_segment, market, order_region, department_name, category_name, product_name, shipping_mode)):
                invalid_id_count += 1
                record_reject(
                    row_num, order_item_id, "missing_required_category", "Empty required dimension label"
                )
                continue

            seen_item_ids.add(order_item_id)
            if profit_per_order < 0:
                neg_profit_count += 1

            accepted_raw.append(
                CleanedOrderItemRow(
                    source_record_id=order_item_id,
                    order_id=order_id,
                    order_date=order_date,
                    order_status=order_status.upper(),
                    payment_type=payment_type.upper(),
                    customer_segment=customer_segment,
                    market=market,
                    order_region=order_region,
                    order_country=order_country,
                    order_city=order_city,
                    department_id=department_id,
                    department_name=department_name,
                    category_id=category_id,
                    category_name=category_name,
                    product_id=product_id,
                    product_name=product_name,
                    product_price=round(product_price, 4),
                    product_status="Available" if product_status == "0" else "Unavailable",
                    quantity=quantity,
                    discount_rate=round(discount_rate, 4),
                    sales=sales,
                    order_item_total=round(order_item_total, 4),
                    profit_per_order=round(profit_per_order, 4),
                    is_profit_outlier=False,
                    shipping_mode=shipping_mode,
                    scheduled_shipping_days=sched_days,
                    eval_real_shipping_days=real_days,
                    eval_delivery_status=delivery_status,
                    eval_late_delivery_risk=late_risk,
                    eval_shipping_date=shipping_date,
                )
            )

    # Flag profit IQR outliers transparently without deleting legitimate loss/margin extremes
    outlier_count = 0
    if len(accepted_raw) >= 4:
        sorted_profits = sorted(r.profit_per_order for r in accepted_raw)
        n = len(sorted_profits)
        q1 = sorted_profits[int((n - 1) * 0.25)]
        q3 = sorted_profits[int((n - 1) * 0.75)]
        iqr = q3 - q1
        lower = q1 - 1.5 * iqr
        upper = q3 + 1.5 * iqr
        updated: list[CleanedOrderItemRow] = []
        for r in accepted_raw:
            is_out = r.profit_per_order < lower or r.profit_per_order > upper
            if is_out:
                outlier_count += 1
                updated.append(
                    CleanedOrderItemRow(**{**r.__dict__, "is_profit_outlier": True})
                )
            else:
                updated.append(r)
        accepted_raw = updated

    pii_removed = [col for col in PII_AND_EXCLUDED_COLUMNS if col in headers]
    all_null_cols = [col for col in headers if total_rows > 0 and null_col_counts.get(col, 0) == total_rows]

    stats = CleaningStats(
        source_dataset="DataCoSupplyChainDataset.csv",
        encoding_used=enc,
        total_rows_read=total_rows,
        accepted_rows=len(accepted_raw),
        rejected_rows=total_rows - len(accepted_raw),
        duplicate_rows_rejected=dup_count,
        invalid_identifier_rows=invalid_id_count,
        invalid_date_rows=invalid_date_count,
        invalid_numeric_rows=invalid_num_count,
        whitespace_trimmed_fields=whitespace_trimmed_fields,
        pii_columns_removed=pii_removed,
        undocumented_columns_detected=list(undocumented_columns or []),
        all_null_columns=all_null_cols,
        negative_profit_rows=neg_profit_count,
        profit_outlier_rows_flagged=outlier_count,
        rejected_samples=rejected_samples,
    )

    return CleaningOutput(rows=accepted_raw, stats=stats)

