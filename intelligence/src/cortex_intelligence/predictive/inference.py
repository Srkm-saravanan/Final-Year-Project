from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from cortex_intelligence.predictive.models import (
    DeliveryDelayPredictionRequest,
    DeliveryDelayPredictionResponse,
    DemandForecastPoint,
    DemandForecastRequest,
    DemandForecastResponse,
    StockoutRiskPredictionRequest,
    StockoutRiskPredictionResponse,
)

logger = logging.getLogger("cortex_intelligence.predictive.inference")


class PredictiveInferenceService:
    """Production inference service serving cached ML models for delivery delays,

    stockout risk, and multi-step demand forecasting.
    """

    def __init__(self, artifacts_dir: str | Path = "intelligence/artifacts/models") -> None:
        self.artifacts_dir = Path(artifacts_dir)
        self.delay_pipeline: Any = None
        self.stockout_pipeline: Any = None
        self.forecast_bundle: Any = None
        self.evaluation_manifest: dict[str, Any] = {}
        self.load_models()

    def load_models(self) -> None:
        delay_path = self.artifacts_dir / "delivery_delay_model.joblib"
        stockout_path = self.artifacts_dir / "stockout_risk_model.joblib"
        forecast_path = self.artifacts_dir / "demand_forecast_model.joblib"
        manifest_path = self.artifacts_dir / "model_evaluation_metrics.json"

        if delay_path.exists():
            self.delay_pipeline = joblib.load(delay_path)
            logger.info("Loaded delivery delay model from %s", delay_path)
        else:
            logger.warning("Delivery delay model not found at %s", delay_path)

        if stockout_path.exists():
            self.stockout_pipeline = joblib.load(stockout_path)
            logger.info("Loaded stockout risk model from %s", stockout_path)
        else:
            logger.warning("Stockout risk model not found at %s", stockout_path)

        if forecast_path.exists():
            self.forecast_bundle = joblib.load(forecast_path)
            logger.info("Loaded demand forecast bundle from %s", forecast_path)
        else:
            logger.warning("Demand forecast model not found at %s", forecast_path)

        if manifest_path.exists():
            with open(manifest_path, "r", encoding="utf-8") as f:
                self.evaluation_manifest = json.load(f)

    def predict_delivery_delay(self, req: DeliveryDelayPredictionRequest) -> DeliveryDelayPredictionResponse:
        if self.delay_pipeline is None:
            raise RuntimeError("Delivery delay model is not loaded.")

        row_dict = {
            "order_hour": req.order_hour,
            "order_dow": req.order_dow,
            "order_month": req.order_month,
            "order_quarter": req.order_quarter,
            "scheduled_shipping_days": req.scheduled_shipping_days,
            "shipping_mode": req.shipping_mode,
            "customer_segment": req.customer_segment,
            "market": req.market,
            "order_region": req.order_region,
            "category_name": req.category_name,
            "unit_price": req.unit_price,
            "quantity": req.quantity,
            "discount_rate": req.discount_rate,
        }
        df_input = pd.DataFrame([row_dict])
        prob = float(self.delay_pipeline.predict_proba(df_input)[0, 1])
        is_delayed = bool(prob >= 0.50)

        if prob < 0.30:
            risk_level = "LOW"
        elif prob < 0.60:
            risk_level = "MEDIUM"
        elif prob < 0.80:
            risk_level = "HIGH"
        else:
            risk_level = "CRITICAL"

        # Heuristic contributing factors based on known domain weights
        factors = []
        if req.shipping_mode == "Standard Class":
            factors.append({"factor": "Shipping Mode: Standard Class", "impact": "High historical variance (+25% risk)"})
        if req.scheduled_shipping_days <= 2:
            factors.append({"factor": "Aggressive Schedule", "impact": f"Only {req.scheduled_shipping_days} days scheduled buffer"})
        if req.quantity >= 3:
            factors.append({"factor": "Multi-Unit Order", "impact": f"Batch picking overhead for {req.quantity} units"})
        if req.order_region in ("South Asia", "Southeast Asia", "Eastern Asia"):
            factors.append({"factor": "Cross-Border Corridor", "impact": f"Customs clearance friction in {req.order_region}"})

        return DeliveryDelayPredictionResponse(
            is_delay_predicted=is_delayed,
            delay_probability=round(prob, 4),
            risk_level=risk_level,
            model_name="LightGBM Delivery Delay Classifier v1.0",
            model_version="1.0.0-chronological",
            top_contributing_factors=factors,
        )

    def predict_stockout_risk(self, req: StockoutRiskPredictionRequest) -> StockoutRiskPredictionResponse:
        if self.stockout_pipeline is None:
            raise RuntimeError("Stockout risk model is not loaded.")

        buffer_gap = req.on_hand_units - req.safety_stock_units
        row_dict = {
            "on_hand_units": req.on_hand_units,
            "safety_stock_units": req.safety_stock_units,
            "reorder_point_units": req.reorder_point_units,
            "stock_buffer_gap": buffer_gap,
            "capacity_units": req.capacity_units,
            "is_directly_affected_by_po_delay": int(req.is_directly_affected_by_po_delay),
            "market": req.market,
        }
        df_input = pd.DataFrame([row_dict])
        prob = float(self.stockout_pipeline.predict_proba(df_input)[0, 1])
        is_stockout = bool(prob >= 0.50)

        if prob < 0.25:
            severity = "NORMAL"
            rec = "Inventory position healthy. Normal automated replenishment cadence."
        elif prob < 0.50:
            severity = "MONITOR"
            rec = "Buffer approaching threshold. Flag for scheduled reorder review."
        elif prob < 0.80:
            severity = "ELEVATED"
            rec = "Stock below safety buffer. Expedite active PO or initiate alternate supplier RFQ."
        else:
            severity = "CRITICAL"
            rec = "Stockout imminent or active. Trigger emergency procurement and allocation freeze."

        return StockoutRiskPredictionResponse(
            is_stockout_risk_predicted=is_stockout,
            stockout_probability=round(prob, 4),
            buffer_gap_units=buffer_gap,
            risk_severity=severity,
            recommendation=rec,
            model_name="RandomForest Stockout Risk Classifier v1.0",
        )

    def forecast_demand(self, req: DemandForecastRequest) -> DemandForecastResponse:
        if self.forecast_bundle is None:
            raise RuntimeError("Demand forecast bundle is not loaded.")

        model = self.forecast_bundle["model"]
        feature_cols = self.forecast_bundle["feature_cols"]
        residual_std = self.forecast_bundle["residual_std"]
        recent_records = self.forecast_bundle["last_known_data"]

        # Project forward recursively or autoregressively for requested horizon
        df_recent = pd.DataFrame(recent_records)
        df_recent["order_date"] = pd.to_datetime(df_recent["order_date"])

        last_date = df_recent["order_date"].max()
        current_history = list(df_recent["units"].values)

        forecast_points: list[DemandForecastPoint] = []
        projected_units_list: list[float] = []

        for step in range(1, req.horizon_days + 1):
            target_date = last_date + timedelta(days=step)
            dow = target_date.day_of_week
            month = target_date.month
            day = target_date.day
            quarter = (month - 1) // 3 + 1

            lag_1 = current_history[-1] if len(current_history) >= 1 else 0.0
            lag_7 = current_history[-7] if len(current_history) >= 7 else lag_1
            lag_14 = current_history[-14] if len(current_history) >= 14 else lag_7
            lag_30 = current_history[-30] if len(current_history) >= 30 else lag_14

            rolling_7 = float(np.mean(current_history[-7:]))
            rolling_30 = float(np.mean(current_history[-30:]))
            rolling_std_7 = float(np.std(current_history[-7:]))

            row_features = pd.DataFrame(
                [
                    {
                        "dow": dow,
                        "month": month,
                        "day": day,
                        "quarter": quarter,
                        "lag_1": lag_1,
                        "lag_7": lag_7,
                        "lag_14": lag_14,
                        "lag_30": lag_30,
                        "rolling_mean_7": rolling_7,
                        "rolling_mean_30": rolling_30,
                        "rolling_std_7": rolling_std_7,
                    }
                ]
            )

            pred_val = float(model.predict(row_features[feature_cols])[0])
            pred_val = max(0.0, pred_val)

            current_history.append(pred_val)
            projected_units_list.append(pred_val)

            # Confidence bounds: 80% (1.28 std), 95% (1.96 std) with sqrt(step) expansion
            uncertainty = residual_std * np.sqrt(1.0 + 0.05 * step)
            forecast_points.append(
                DemandForecastPoint(
                    date=target_date.strftime("%Y-%m-%d"),
                    predicted_units=round(pred_val, 2),
                    lower_bound_80=round(max(0.0, pred_val - 1.28 * uncertainty), 2),
                    upper_bound_80=round(pred_val + 1.28 * uncertainty, 2),
                    lower_bound_95=round(max(0.0, pred_val - 1.96 * uncertainty), 2),
                    upper_bound_95=round(pred_val + 1.96 * uncertainty, 2),
                )
            )

        total_units = sum(projected_units_list)
        avg_units = total_units / len(projected_units_list)

        return DemandForecastResponse(
            category_name=req.category_name,
            horizon_days=req.horizon_days,
            forecast_points=forecast_points,
            summary_metrics={
                "total_projected_units": round(total_units, 2),
                "daily_average_units": round(avg_units, 2),
                "peak_daily_units": round(max(projected_units_list), 2),
                "trough_daily_units": round(min(projected_units_list), 2),
            },
            model_name=f"HistGradientBoosting Multi-Horizon Forecaster ({req.horizon_days}d)",
        )

    def get_manifest(self) -> dict[str, Any]:
        return self.evaluation_manifest

