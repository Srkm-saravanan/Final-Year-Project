from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from cortex_intelligence.api.main import create_app
from cortex_intelligence.config import Settings
from cortex_intelligence.predictive.inference import PredictiveInferenceService
from cortex_intelligence.predictive.models import (
    DeliveryDelayPredictionRequest,
    DemandForecastRequest,
    StockoutRiskPredictionRequest,
)
from cortex_intelligence.simulation.engine import MonteCarloSimulationEngine
from cortex_intelligence.simulation.models import MonteCarloSimulationRequest


def test_hybrid_data_pipeline_outputs_and_manifest():
    """Verify that all processed hybrid data artifacts exist and pass schema checks."""
    base = Path(".")
    hybrid_dir = base / "data" / "processed" / "hybrid"
    manifest_path = hybrid_dir / "hybrid_manifest.json"

    assert manifest_path.exists(), "hybrid_manifest.json must exist"
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest["validation_checks"]["no_arbitrary_row_level_joins"] is True
    assert manifest["validation_checks"]["source_dataset_provenance_preserved"] is True
    assert manifest["validation_checks"]["target_leakage_safeguards_enforced"] is True

    # Check parquet datasets
    delay_path = hybrid_dir / "delivery_delay_features.parquet"
    stockout_path = hybrid_dir / "stockout_risk_features.parquet"
    demand_path = hybrid_dir / "daily_category_demand.parquet"

    assert delay_path.exists()
    assert stockout_path.exists()
    assert demand_path.exists()

    df_delay = pd.read_parquet(delay_path)
    assert len(df_delay) > 100000
    assert "late_delivery_risk" in df_delay.columns
    assert "source_dataset" in df_delay.columns
    assert "is_synthetic" in df_delay.columns
    assert set(df_delay["split"].unique()) == {"train", "val", "test"}


def test_chronological_splits_and_leakage_safeguards():
    """Verify chronological split monotonicity and ensure no post-dispatch features leak."""
    hybrid_dir = Path("data/processed/hybrid")
    df_delay = pd.read_parquet(hybrid_dir / "delivery_delay_features.parquet")

    # 1. Monotonicity check
    train_dates = pd.to_datetime(df_delay[df_delay["split"] == "train"]["order_timestamp"])
    val_dates = pd.to_datetime(df_delay[df_delay["split"] == "val"]["order_timestamp"])
    test_dates = pd.to_datetime(df_delay[df_delay["split"] == "test"]["order_timestamp"])

    assert train_dates.max() <= val_dates.min(), "Train dates must precede Val dates"
    assert val_dates.max() <= test_dates.min(), "Val dates must precede Test dates"

    # 2. Leakage safeguard: assert post-dispatch columns are NOT in feature matrix
    disallowed_leakage_columns = [
        "Days for shipping (real)",
        "real_shipping_days",
        "Delivery Status",
        "Benefit per order",
        "Order Profit Per Order",
        "Order Item Profit Ratio",
        "shipping date (DateOrders)",
        "shipping_timestamp",
    ]
    for col in disallowed_leakage_columns:
        assert col not in df_delay.columns, f"Leaked column '{col}' detected in pre-order feature matrix!"


def test_delivery_delay_model_inference():
    """Verify inference on trained LightGBM delivery delay classifier."""
    service = PredictiveInferenceService()
    req = DeliveryDelayPredictionRequest(
        scheduled_shipping_days=4,
        shipping_mode="Standard Class",
        customer_segment="Consumer",
        market="Pacific Asia",
        order_region="Southeast Asia",
        category_name="Cardio Equipment",
        unit_price=150.0,
        quantity=2,
        discount_rate=0.05,
    )
    res = service.predict_delivery_delay(req)

    assert 0.0 <= res.delay_probability <= 1.0
    assert res.risk_level in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    assert "LightGBM" in res.model_name or "GradientBoosting" in res.model_name
    assert len(res.top_contributing_factors) > 0


def test_stockout_risk_model_inference():
    """Verify stockout risk predictions for safe vs breached warehouse inventory buffers."""
    service = PredictiveInferenceService()

    # Case A: Healthy buffer
    safe_req = StockoutRiskPredictionRequest(
        on_hand_units=800,
        safety_stock_units=300,
        reorder_point_units=500,
        is_directly_affected_by_po_delay=False,
    )
    safe_res = service.predict_stockout_risk(safe_req)
    assert safe_res.buffer_gap_units == 500
    assert safe_res.risk_severity in ["NORMAL", "MONITOR"]

    # Case B: Depleted stock with active PO delay
    danger_req = StockoutRiskPredictionRequest(
        on_hand_units=50,
        safety_stock_units=300,
        reorder_point_units=500,
        is_directly_affected_by_po_delay=True,
    )
    danger_res = service.predict_stockout_risk(danger_req)
    assert danger_res.buffer_gap_units == -250
    assert danger_res.stockout_probability > 0.50
    assert danger_res.is_stockout_risk_predicted is True
    assert danger_res.risk_severity in ["ELEVATED", "CRITICAL"]


def test_demand_forecasting_multi_horizon():
    """Verify multi-horizon forecasts for 7, 30, and 90 days with expanding uncertainty."""
    service = PredictiveInferenceService()

    for h in [7, 30, 90]:
        req = DemandForecastRequest(category_name="All Categories", horizon_days=h)  # type: ignore[arg-type]
        res = service.forecast_demand(req)

        assert res.horizon_days == h
        assert len(res.forecast_points) == h
        assert res.summary_metrics["total_projected_units"] > 0

        # Check expanding confidence interval bounds
        first_pt = res.forecast_points[0]
        last_pt = res.forecast_points[-1]

        first_spread = first_pt.upper_bound_95 - first_pt.lower_bound_95
        last_spread = last_pt.upper_bound_95 - last_pt.lower_bound_95
        assert last_spread >= first_spread, "Uncertainty must expand with forecast horizon"


def test_monte_carlo_simulation_engine():
    """Verify stochastic Monte Carlo simulation, VaR, CVaR, and mitigation modeling."""
    engine = MonteCarloSimulationEngine(seed=42)

    req = MonteCarloSimulationRequest(
        scenario_name="Test Disruption Scenario",
        iterations=1000,
        demand_shock_mean=0.20,
        supplier_delay_days_mean=14.0,
        baseline_daily_demand=100.0,
        baseline_inventory_units=1000.0,
        safety_stock_units=500.0,
        simulation_horizon_days=30,
        unit_sale_price_usd=100.0,
        unit_cogs_usd=50.0,
    )
    res = engine.simulate(req)

    assert res.iterations == 1000
    assert 0.0 <= res.stockout_probability <= 1.0
    assert res.value_at_risk_95_usd >= 0.0
    assert res.conditional_var_95_usd >= res.value_at_risk_95_usd, "CVaR-95 must be at least as severe as VaR-95"
    assert len(res.sensitivity_analysis) == 4

    # Test expediting mitigation reduces stockout probability
    req_mitigated = req.model_copy(
        update={
            "expedited_freight_cost_usd": 5000.0,
            "expedited_lead_time_reduction_days": 10.0,
        }
    )
    res_mitigated = engine.simulate(req_mitigated)
    assert res_mitigated.stockout_probability < res.stockout_probability, "Expediting must reduce stockout probability"


def test_fastapi_predictive_endpoints():
    """Verify HTTP contracts, Pydantic validation, and auth on FastAPI predictive endpoints."""
    settings = Settings(
        neo4j_uri="bolt://localhost:7687",
        neo4j_user="neo4j",
        neo4j_password="cortex_password",
        intelligence_api_key="test-cortex-key",
    )
    app = create_app(settings_override=settings)
    client = TestClient(app)

    auth_headers = {"X-Cortex-Service-Key": "test-cortex-key"}

    # 1. Models Manifest
    r_man = client.get("/api/v1/predictive/models/manifest", headers=auth_headers)
    assert r_man.status_code == 200
    data_man = r_man.json()
    assert data_man["success"] is True
    assert "delivery_delay_classifier" in data_man["data"]["models"]

    # 2. Delivery Delay Prediction
    r_delay = client.post(
        "/api/v1/predictive/delivery-delay",
        headers=auth_headers,
        json={
            "scheduled_shipping_days": 4,
            "shipping_mode": "Standard Class",
            "customer_segment": "Consumer",
            "market": "Pacific Asia",
            "order_region": "Southeast Asia",
            "category_name": "Cardio Equipment",
            "unit_price": 120.0,
            "quantity": 1,
            "discount_rate": 0.05,
        },
    )
    assert r_delay.status_code == 200
    assert r_delay.json()["data"]["risk_level"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

    # 3. Stockout Risk Prediction
    r_stock = client.post(
        "/api/v1/predictive/stockout-risk",
        headers=auth_headers,
        json={
            "warehouse_code": "SYN-WH-001",
            "market": "USCA",
            "on_hand_units": 100,
            "safety_stock_units": 300,
            "reorder_point_units": 450,
            "is_directly_affected_by_po_delay": True,
        },
    )
    assert r_stock.status_code == 200
    assert "is_stockout_risk_predicted" in r_stock.json()["data"]

    # 4. Demand Forecasting
    r_fore = client.post(
        "/api/v1/predictive/demand-forecast",
        headers=auth_headers,
        json={"category_name": "All Categories", "horizon_days": 30},
    )
    assert r_fore.status_code == 200
    assert len(r_fore.json()["data"]["forecast_points"]) == 30

    # 5. Monte Carlo Simulation
    r_sim = client.post(
        "/api/v1/predictive/simulate-scenario",
        headers=auth_headers,
        json={
            "scenario_name": "API Disruption Scenario",
            "iterations": 500,
            "demand_shock_mean": 0.10,
            "supplier_delay_days_mean": 8.0,
            "simulation_horizon_days": 30,
        },
    )
    assert r_sim.status_code == 200
    assert "value_at_risk_95_usd" in r_sim.json()["data"]

    # 6. Auth Failure Check
    r_unauth = client.get("/api/v1/predictive/models/manifest")
    assert r_unauth.status_code in [401, 403]
