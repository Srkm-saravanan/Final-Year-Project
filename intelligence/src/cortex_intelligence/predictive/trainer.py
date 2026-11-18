from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from cortex_intelligence.predictive.delivery_delay import DeliveryDelayModelTrainer
from cortex_intelligence.predictive.demand_forecast import DemandForecastTrainer
from cortex_intelligence.predictive.stockout_risk import StockoutRiskModelTrainer

logger = logging.getLogger("cortex_intelligence.predictive.trainer")


class PredictiveModelTrainer:
    """Orchestrates end-to-end training and serialization of all Phase 3 predictive models."""

    def __init__(self, artifacts_dir: str | Path = "intelligence/artifacts/models") -> None:
        self.artifacts_dir = Path(artifacts_dir)
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

    def train_all(self) -> dict[str, Any]:
        logger.info("Starting training of all Phase 3 predictive models...")
        timestamp = datetime.now(timezone.utc).isoformat()

        # 1. Train Delivery Delay Model
        logger.info("--> 1/3 Training Delivery Delay Classifier...")
        delay_trainer = DeliveryDelayModelTrainer()
        delay_res = delay_trainer.train_and_evaluate()
        delay_trainer.save_model(
            delay_res["best_pipeline"],
            self.artifacts_dir / "delivery_delay_model.joblib",
        )

        # 2. Train Stockout Risk Model
        logger.info("--> 2/3 Training Stockout Risk Classifier...")
        stockout_trainer = StockoutRiskModelTrainer()
        stockout_res = stockout_trainer.train_and_evaluate()
        stockout_trainer.save_model(
            stockout_res["best_pipeline"],
            self.artifacts_dir / "stockout_risk_model.joblib",
        )

        # 3. Train Demand Forecasting Model
        logger.info("--> 3/3 Training Demand Forecasting Engine...")
        forecast_trainer = DemandForecastTrainer()
        forecast_res = forecast_trainer.train_and_evaluate()
        forecast_bundle = {
            "model": forecast_res["best_model"],
            "feature_cols": forecast_res["feature_cols"],
            "residual_std": forecast_res["residual_std"],
            "last_known_data": forecast_res["last_known_data"],
        }
        forecast_trainer.save_model(
            forecast_bundle,
            self.artifacts_dir / "demand_forecast_model.joblib",
        )

        # 4. Consolidate Evaluation Metrics
        evaluation_manifest = {
            "trained_at": timestamp,
            "artifacts_dir": str(self.artifacts_dir),
            "models": {
                "delivery_delay_classifier": {
                    "task": "Binary Classification (Late Delivery Risk)",
                    "target": "late_delivery_risk (1=Late, 0=On-Time)",
                    "test_split_type": "Chronological Out-Of-Sample (15% held-out)",
                    "test_samples": delay_res["test_sample_size"],
                    "metrics": delay_res["metrics"],
                },
                "stockout_risk_classifier": {
                    "task": "Binary Classification (Inventory Stockout Risk)",
                    "target": "stockout_risk (1=At Risk, 0=Sufficient Buffer)",
                    "test_split_type": "Stratified Test Split (25% held-out)",
                    "test_samples": stockout_res["test_sample_size"],
                    "metrics": stockout_res["metrics"],
                },
                "demand_forecast_engine": {
                    "task": "Multi-Horizon Time Series Demand Forecasting (7d, 30d, 90d)",
                    "target": "daily_units",
                    "test_split_type": "Chronological 90-Day Forward Window",
                    "test_samples": forecast_res["test_sample_size"],
                    "residual_std": forecast_res["residual_std"],
                    "metrics": forecast_res["metrics"],
                },
            },
        }

        manifest_path = self.artifacts_dir / "model_evaluation_metrics.json"
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(evaluation_manifest, f, indent=2)

        logger.info("Successfully trained and saved all models. Evaluation manifest: %s", manifest_path)
        return evaluation_manifest


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    trainer = PredictiveModelTrainer()
    summary = trainer.train_all()
    print(json.dumps(summary, indent=2))

