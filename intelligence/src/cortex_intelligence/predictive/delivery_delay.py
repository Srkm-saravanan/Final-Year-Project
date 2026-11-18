from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

try:
    from lightgbm import LGBMClassifier
    HAS_LIGHTGBM = True
except ImportError:
    HAS_LIGHTGBM = False
    from sklearn.ensemble import HistGradientBoostingClassifier as LGBMClassifier

logger = logging.getLogger("cortex_intelligence.predictive.delivery_delay")


class DeliveryDelayModelTrainer:
    """Trains, evaluates, and serializes Delivery Delay prediction models with strict

    chronological test evaluation and zero data leakage.
    """

    NUMERIC_FEATURES = [
        "order_hour",
        "order_dow",
        "order_month",
        "order_quarter",
        "scheduled_shipping_days",
        "unit_price",
        "quantity",
        "discount_rate",
    ]

    CATEGORICAL_FEATURES = [
        "shipping_mode",
        "customer_segment",
        "market",
        "order_region",
        "category_name",
    ]

    TARGET_COL = "late_delivery_risk"

    def __init__(self, data_path: str | Path = "data/processed/hybrid/delivery_delay_features.parquet") -> None:
        self.data_path = Path(data_path)
        self.preprocessor = ColumnTransformer(
            transformers=[
                ("num", StandardScaler(), self.NUMERIC_FEATURES),
                ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), self.CATEGORICAL_FEATURES),
            ]
        )

    def load_data(self) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
        if not self.data_path.exists():
            raise FileNotFoundError(f"Delay features dataset not found at {self.data_path}")

        df = pd.read_parquet(self.data_path)
        train_df = df[df["split"] == "train"].copy()
        val_df = df[df["split"] == "val"].copy()
        test_df = df[df["split"] == "test"].copy()

        logger.info(
            "Loaded data with chronological split - Train: %d, Val: %d, Test: %d",
            len(train_df),
            len(val_df),
            len(test_df),
        )
        return train_df, val_df, test_df

    def train_and_evaluate(self) -> dict[str, Any]:
        train_df, val_df, test_df = self.load_data()

        X_train = train_df[self.NUMERIC_FEATURES + self.CATEGORICAL_FEATURES]
        y_train = train_df[self.TARGET_COL].values

        X_test = test_df[self.NUMERIC_FEATURES + self.CATEGORICAL_FEATURES]
        y_test = test_df[self.TARGET_COL].values

        results: dict[str, Any] = {}

        # 1. Baseline 1: Dummy Prior Classifier
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

        # 2. Baseline 2: Logistic Regression (Regularized with Balanced Weights)
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

        # 3. Advanced Model: LightGBM / Gradient Boosting Classifier
        lgbm_kwargs: dict[str, Any] = {
            "n_estimators": 200,
            "learning_rate": 0.05,
            "random_state": 42,
            "class_weight": "balanced",
            "n_jobs": -1,
        }
        if not HAS_LIGHTGBM:
            lgbm_kwargs.pop("class_weight", None)
            lgbm_kwargs.pop("n_jobs", None)

        advanced_pipeline = Pipeline(
            steps=[
                ("preprocessor", self.preprocessor),
                ("classifier", LGBMClassifier(**lgbm_kwargs)),
            ]
        )
        advanced_pipeline.fit(X_train, y_train)
        y_pred_adv = advanced_pipeline.predict(X_test)
        y_prob_adv = advanced_pipeline.predict_proba(X_test)[:, 1]

        results["advanced_gradient_boosting"] = {
            "model_type": "LightGBM / HistGradientBoosting",
            "accuracy": float(accuracy_score(y_test, y_pred_adv)),
            "precision": float(precision_score(y_test, y_pred_adv, zero_division=0)),
            "recall": float(recall_score(y_test, y_pred_adv, zero_division=0)),
            "f1": float(f1_score(y_test, y_pred_adv, zero_division=0)),
            "roc_auc": float(roc_auc_score(y_test, y_prob_adv)),
            "pr_auc": float(average_precision_score(y_test, y_prob_adv)),
        }

        return {
            "best_pipeline": advanced_pipeline,
            "metrics": results,
            "test_sample_size": len(y_test),
        }

    def save_model(self, pipeline: Any, out_path: str | Path = "intelligence/artifacts/models/delivery_delay_model.joblib") -> None:
        out_p = Path(out_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(pipeline, out_p)
        logger.info("Saved delivery delay pipeline to %s", out_p)

