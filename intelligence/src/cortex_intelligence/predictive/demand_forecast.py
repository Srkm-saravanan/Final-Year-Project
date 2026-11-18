from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error

logger = logging.getLogger("cortex_intelligence.predictive.demand_forecast")


class DemandForecastTrainer:
    """Multi-horizon demand forecasting engine for 7-day, 30-day, and 90-day horizons

    with lag-feature engineering and baseline comparisons.
    """

    def __init__(self, data_path: str | Path = "data/processed/hybrid/daily_category_demand.parquet") -> None:
        self.data_path = Path(data_path)

    def load_data(self) -> pd.DataFrame:
        if not self.data_path.exists():
            raise FileNotFoundError(f"Daily demand dataset not found at {self.data_path}")
        df = pd.read_parquet(self.data_path)
        df["order_date"] = pd.to_datetime(df["order_date"])
        return df

    def prepare_time_series(self, df: pd.DataFrame, category: str = "All Categories") -> pd.DataFrame:
        if category != "All Categories":
            df_filtered = df[df["category_name"] == category].copy()
            daily = (
                df_filtered.groupby("order_date")
                .agg(units=("daily_units", "sum"), revenue=("daily_revenue", "sum"))
                .reset_index()
            )
        else:
            daily = (
                df.groupby("order_date")
                .agg(units=("daily_units", "sum"), revenue=("daily_revenue", "sum"))
                .reset_index()
            )

        daily = daily.sort_values("order_date").reset_index(drop=True)

        # Ensure continuous daily index
        idx = pd.date_range(daily["order_date"].min(), daily["order_date"].max())
        daily = daily.set_index("order_date").reindex(idx, fill_value=0).reset_index()
        daily = daily.rename(columns={"index": "order_date"})

        # Feature engineering: Calendar & Lags
        daily["dow"] = daily["order_date"].dt.day_of_week
        daily["month"] = daily["order_date"].dt.month
        daily["day"] = daily["order_date"].dt.day
        daily["quarter"] = daily["order_date"].dt.quarter

        # Lag features
        daily["lag_1"] = daily["units"].shift(1)
        daily["lag_7"] = daily["units"].shift(7)
        daily["lag_14"] = daily["units"].shift(14)
        daily["lag_30"] = daily["units"].shift(30)

        # Rolling statistics
        daily["rolling_mean_7"] = daily["units"].shift(1).rolling(window=7).mean()
        daily["rolling_mean_30"] = daily["units"].shift(1).rolling(window=30).mean()
        daily["rolling_std_7"] = daily["units"].shift(1).rolling(window=7).std()

        return daily.dropna().reset_index(drop=True)

    def train_and_evaluate(self) -> dict[str, Any]:
        df = self.load_data()
        ts_df = self.prepare_time_series(df, category="All Categories")

        feature_cols = [
            "dow",
            "month",
            "day",
            "quarter",
            "lag_1",
            "lag_7",
            "lag_14",
            "lag_30",
            "rolling_mean_7",
            "rolling_mean_30",
            "rolling_std_7",
        ]

        # Chronological Split: 90-day test set
        n_total = len(ts_df)
        test_size = 90
        train_df = ts_df.iloc[:-test_size].copy()
        test_df = ts_df.iloc[-test_size:].copy()

        X_train = train_df[feature_cols]
        y_train = train_df["units"].values

        X_test = test_df[feature_cols]
        y_test = test_df["units"].values

        results: dict[str, Any] = {}

        # 1. Baseline: 7-day Moving Average
        y_pred_ma7 = test_df["rolling_mean_7"].values
        results["baseline_moving_average_7d"] = {
            "model_type": "7-Day Moving Average",
            "mae": float(mean_absolute_error(y_test, y_pred_ma7)),
            "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred_ma7))),
            "wape": float(np.sum(np.abs(y_test - y_pred_ma7)) / np.sum(y_test)),
        }

        # 2. Baseline: 30-day Moving Average
        y_pred_ma30 = test_df["rolling_mean_30"].values
        results["baseline_moving_average_30d"] = {
            "model_type": "30-Day Moving Average",
            "mae": float(mean_absolute_error(y_test, y_pred_ma30)),
            "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred_ma30))),
            "wape": float(np.sum(np.abs(y_test - y_pred_ma30)) / np.sum(y_test)),
        }

        # 3. Model: Ridge Regression
        ridge = Ridge(alpha=1.0)
        ridge.fit(X_train, y_train)
        y_pred_ridge = ridge.predict(X_test)
        results["model_ridge_regression"] = {
            "model_type": "Autoregressive Ridge Regression",
            "mae": float(mean_absolute_error(y_test, y_pred_ridge)),
            "rmse": float(np.sqrt(mean_squared_error(y_test, y_pred_ridge))),
            "wape": float(np.sum(np.abs(y_test - y_pred_ridge)) / np.sum(y_test)),
        }

        # 4. Advanced Model: HistGradientBoosting Regressor
        hgb = HistGradientBoostingRegressor(max_iter=150, learning_rate=0.05, random_state=42)
        hgb.fit(X_train, y_train)
        y_pred_hgb = hgb.predict(X_test)

        # Multi-horizon evaluations
        for horizon in [7, 30, 90]:
            y_t = y_test[:horizon]
            y_p = y_pred_hgb[:horizon]
            results[f"gradient_boosting_{horizon}d"] = {
                "model_type": f"HistGradientBoostingRegressor ({horizon}-Day)",
                "mae": float(mean_absolute_error(y_t, y_p)),
                "rmse": float(np.sqrt(mean_squared_error(y_t, y_p))),
                "wape": float(np.sum(np.abs(y_t - y_p)) / np.sum(y_t)),
            }

        residuals = y_test - y_pred_hgb
        residual_std = float(np.std(residuals))

        return {
            "best_model": hgb,
            "feature_cols": feature_cols,
            "residual_std": residual_std,
            "metrics": results,
            "test_sample_size": len(y_test),
            "last_known_data": ts_df.tail(60).to_dict(orient="records"),
        }

    def save_model(self, model_bundle: Any, out_path: str | Path = "intelligence/artifacts/models/demand_forecast_model.joblib") -> None:
        out_p = Path(out_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model_bundle, out_p)
        logger.info("Saved demand forecast model bundle to %s", out_p)

