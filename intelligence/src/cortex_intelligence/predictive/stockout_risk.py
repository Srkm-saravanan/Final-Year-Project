from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

logger = logging.getLogger("cortex_intelligence.predictive.stockout_risk")


class StockoutRiskModelTrainer:
    """Trains, evaluates, and serializes Inventory Stockout Risk classification models."""

    NUMERIC_FEATURES = [
        "on_hand_units",
        "safety_stock_units",
        "reorder_point_units",
        "stock_buffer_gap",
        "capacity_units",
        "is_directly_affected_by_po_delay",
    ]

    CATEGORICAL_FEATURES = ["market"]

    TARGET_COL = "stockout_risk"

    def __init__(self, data_path: str | Path = "data/processed/hybrid/stockout_risk_features.parquet") -> None:
        self.data_path = Path(data_path)
        self.preprocessor = ColumnTransformer(
            transformers=[
                ("num", StandardScaler(), self.NUMERIC_FEATURES),
                ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), self.CATEGORICAL_FEATURES),
            ]
        )

    def load_data(self) -> tuple[pd.DataFrame, pd.DataFrame]:
        if not self.data_path.exists():
            raise FileNotFoundError(f"Stockout risk features dataset not found at {self.data_path}")

        df = pd.read_parquet(self.data_path)
        train_df, test_df = train_test_split(
            df,
            test_size=0.25,
            random_state=42,
            stratify=df[self.TARGET_COL],
        )
        logger.info("Loaded stockout data - Train: %d, Test: %d", len(train_df), len(test_df))
        return train_df, test_df

    def train_and_evaluate(self) -> dict[str, Any]:
        train_df, test_df = self.load_data()

        X_train = train_df[self.NUMERIC_FEATURES + self.CATEGORICAL_FEATURES]
        y_train = train_df[self.TARGET_COL].values

        X_test = test_df[self.NUMERIC_FEATURES + self.CATEGORICAL_FEATURES]
        y_test = test_df[self.TARGET_COL].values

        results: dict[str, Any] = {}

        # 1. Baseline: Dummy Classifier
        dummy = DummyClassifier(strategy="most_frequent")
        dummy.fit(X_train, y_train)
        y_pred_dummy = dummy.predict(X_test)
        y_prob_dummy = dummy.predict_proba(X_test)[:, 1]

        results["baseline_dummy"] = {
            "model_type": "DummyClassifier(most_frequent)",
            "accuracy": float(accuracy_score(y_test, y_pred_dummy)),
            "precision": float(precision_score(y_test, y_pred_dummy, zero_division=0)),
            "recall": float(recall_score(y_test, y_pred_dummy, zero_division=0)),
            "f1": float(f1_score(y_test, y_pred_dummy, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, y_prob_dummy)),
            "pr_auc": float(average_precision_score(y_test, y_prob_dummy)),
        }

        # 2. Baseline 2: Logistic Regression
        lr_pipeline = Pipeline(
            steps=[
                ("preprocessor", self.preprocessor),
                ("classifier", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)),
            ]
        )
        lr_pipeline.fit(X_train, y_train)
        y_pred_lr = lr_pipeline.predict(X_test)
        y_prob_lr = lr_pipeline.predict_proba(X_test)[:, 1]

        results["baseline_logistic_regression"] = {
            "model_type": "LogisticRegression(L2, balanced)",
            "accuracy": float(accuracy_score(y_test, y_pred_lr)),
            "precision": float(precision_score(y_test, y_pred_lr, zero_division=0)),
            "recall": float(recall_score(y_test, y_pred_lr, zero_division=0)),
            "f1": float(f1_score(y_test, y_pred_lr, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, y_prob_lr)),
            "pr_auc": float(average_precision_score(y_test, y_prob_lr)),
        }

        # 3. Advanced Model: Random Forest Classifier
        rf_pipeline = Pipeline(
            steps=[
                ("preprocessor", self.preprocessor),
                (
                    "classifier",
                    RandomForestClassifier(
                        n_estimators=100,
                        max_depth=6,
                        class_weight="balanced",
                        random_state=42,
                    ),
                ),
            ]
        )
        rf_pipeline.fit(X_train, y_train)
        y_pred_rf = rf_pipeline.predict(X_test)
        y_prob_rf = rf_pipeline.predict_proba(X_test)[:, 1]

        results["advanced_random_forest"] = {
            "model_type": "RandomForestClassifier",
            "accuracy": float(accuracy_score(y_test, y_pred_rf)),
            "precision": float(precision_score(y_test, y_pred_rf, zero_division=0)),
            "recall": float(recall_score(y_test, y_pred_rf, zero_division=0)),
            "f1": float(f1_score(y_test, y_pred_rf, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, y_prob_rf)),
            "pr_auc": float(average_precision_score(y_test, y_prob_rf)),
        }

        return {
            "best_pipeline": rf_pipeline,
            "metrics": results,
            "test_sample_size": len(y_test),
        }

    def save_model(self, pipeline: Any, out_path: str | Path = "intelligence/artifacts/models/stockout_risk_model.joblib") -> None:
        out_p = Path(out_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(pipeline, out_p)
        logger.info("Saved stockout risk pipeline to %s", out_p)

