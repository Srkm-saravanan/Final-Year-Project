from __future__ import annotations

import collections
import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from cortex_intelligence.pipeline.validation import detect_csv_encoding


@dataclass
class DatasetProfile:
    row_count: int
    column_count: int
    encoding: str
    columns: list[str]
    null_counts: dict[str, int] = field(default_factory=dict)
    all_null_columns: list[str] = field(default_factory=list)
    whitespace_anomaly_counts: dict[str, int] = field(default_factory=dict)
    distinct_counts_summary: dict[str, int] = field(default_factory=dict)
    delivery_status_counts: dict[str, int] = field(default_factory=dict)
    order_status_counts: dict[str, int] = field(default_factory=dict)
    profit_quantiles: dict[str, float] = field(default_factory=dict)
    negative_profit_rows: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "row_count": self.row_count,
            "column_count": self.column_count,
            "encoding": self.encoding,
            "columns": self.columns,
            "null_counts": self.null_counts,
            "all_null_columns": self.all_null_columns,
            "whitespace_anomaly_counts": self.whitespace_anomaly_counts,
            "distinct_counts_summary": self.distinct_counts_summary,
            "delivery_status_counts": self.delivery_status_counts,
            "order_status_counts": self.order_status_counts,
            "profit_quantiles": self.profit_quantiles,
            "negative_profit_rows": self.negative_profit_rows,
        }


def _quantile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    idx = (len(sorted_vals) - 1) * p
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return round(sorted_vals[lo] * (1.0 - frac) + sorted_vals[hi] * frac, 4)


def profile_dataco_csv(csv_path: Path, encoding: str | None = None) -> DatasetProfile:
    """Stages 3 & 4: Inspect schema, nulls, whitespace anomalies, and key distributions."""
    enc = encoding or detect_csv_encoding(csv_path)
    nulls: collections.Counter[str] = collections.Counter()
    whitespace: collections.Counter[str] = collections.Counter()
    delivery_status: collections.Counter[str] = collections.Counter()
    order_status: collections.Counter[str] = collections.Counter()
    unique_orders: set[str] = set()
    unique_items: set[str] = set()
    unique_products: set[str] = set()
    unique_categories: set[str] = set()
    unique_departments: set[str] = set()
    unique_regions: set[str] = set()
    profits: list[float] = []
    neg_profit = 0
    row_count = 0

    with csv_path.open("r", encoding=enc, newline="") as fh:
        reader = csv.DictReader(fh)
        columns = list(reader.fieldnames or [])
        for row in reader:
            row_count += 1
            for col in columns:
                val = row.get(col)
                if val is None or val.strip() == "":
                    nulls[col] += 1
                elif val != val.strip():
                    whitespace[col] += 1

            if oi := (row.get("Order Id") or "").strip():
                unique_orders.add(oi)
            if oii := (row.get("Order Item Id") or "").strip():
                unique_items.add(oii)
            if pid := (row.get("Product Card Id") or "").strip():
                unique_products.add(pid)
            if cid := (row.get("Category Id") or "").strip():
                unique_categories.add(cid)
            if did := (row.get("Department Id") or "").strip():
                unique_departments.add(did)
            if reg := (row.get("Order Region") or "").strip():
                unique_regions.add(reg)

            ds = (row.get("Delivery Status") or "").strip()
            if ds:
                delivery_status[ds] += 1
            os_val = (row.get("Order Status") or "").strip()
            if os_val:
                order_status[os_val] += 1

            raw_profit = (row.get("Order Profit Per Order") or "").strip()
            if raw_profit:
                try:
                    pf = float(raw_profit)
                    profits.append(pf)
                    if pf < 0:
                        neg_profit += 1
                except ValueError:
                    pass

    all_null_cols = [c for c in columns if row_count > 0 and nulls[c] == row_count]
    profits.sort()
    q1 = _quantile(profits, 0.25)
    med = _quantile(profits, 0.50)
    q3 = _quantile(profits, 0.75)
    iqr = round(q3 - q1, 4)

    return DatasetProfile(
        row_count=row_count,
        column_count=len(columns),
        encoding=enc,
        columns=columns,
        null_counts={k: int(nulls[k]) for k in columns if nulls[k] > 0},
        all_null_columns=all_null_cols,
        whitespace_anomaly_counts={k: int(v) for k, v in whitespace.items()},
        distinct_counts_summary={
            "unique_orders": len(unique_orders),
            "unique_order_items": len(unique_items),
            "unique_products": len(unique_products),
            "unique_categories": len(unique_categories),
            "unique_departments": len(unique_departments),
            "unique_regions": len(unique_regions),
        },
        delivery_status_counts=dict(delivery_status),
        order_status_counts=dict(order_status),
        profit_quantiles={
            "min": round(profits[0], 4) if profits else 0.0,
            "q1": q1,
            "median": med,
            "q3": q3,
            "max": round(profits[-1], 4) if profits else 0.0,
            "iqr": iqr,
            "lower_fence": round(q1 - 1.5 * iqr, 4),
            "upper_fence": round(q3 + 1.5 * iqr, 4),
        },
        negative_profit_rows=neg_profit,
    )

