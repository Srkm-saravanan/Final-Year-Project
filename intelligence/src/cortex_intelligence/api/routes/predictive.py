from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from cortex_intelligence.api.dependencies import require_service_key
from cortex_intelligence.predictive.inference import PredictiveInferenceService
from cortex_intelligence.predictive.models import (
    DeliveryDelayPredictionRequest,
    DeliveryDelayPredictionResponse,
    DemandForecastRequest,
    DemandForecastResponse,
    StockoutRiskPredictionRequest,
    StockoutRiskPredictionResponse,
)
from cortex_intelligence.simulation.engine import MonteCarloSimulationEngine
from cortex_intelligence.simulation.models import (
    MonteCarloSimulationRequest,
    MonteCarloSimulationResponse,
)

logger = logging.getLogger("cortex_intelligence.api.routes.predictive")

router = APIRouter(
    prefix="/api/v1/predictive",
    tags=["Predictive Analytics & Simulation"],
    dependencies=[Depends(require_service_key)],
)

# Singleton instances for API efficiency
_inference_service: PredictiveInferenceService | None = None
_simulation_engine: MonteCarloSimulationEngine | None = None


def get_inference_service() -> PredictiveInferenceService:
    global _inference_service
    if _inference_service is None:
        _inference_service = PredictiveInferenceService()
    return _inference_service


def get_simulation_engine() -> MonteCarloSimulationEngine:
    global _simulation_engine
    if _simulation_engine is None:
        _simulation_engine = MonteCarloSimulationEngine()
    return _simulation_engine


@router.post("/delivery-delay", response_model=dict[str, Any])
def predict_delivery_delay(
    request: DeliveryDelayPredictionRequest,
    service: PredictiveInferenceService = Depends(get_inference_service),
) -> dict[str, Any]:
    """Predict delivery delay risk probability and contributing factors for an order at placement time."""
    try:
        result = service.predict_delivery_delay(request)
        return {"success": True, "data": result.model_dump(), "error": None}
    except Exception as exc:
        logger.exception("Delivery delay prediction failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Delivery delay prediction failed: {str(exc)}",
        ) from exc


@router.post("/stockout-risk", response_model=dict[str, Any])
def predict_stockout_risk(
    request: StockoutRiskPredictionRequest,
    service: PredictiveInferenceService = Depends(get_inference_service),
) -> dict[str, Any]:
    """Predict warehouse inventory stockout probability based on on-hand stock and PO delay impacts."""
    try:
        result = service.predict_stockout_risk(request)
        return {"success": True, "data": result.model_dump(), "error": None}
    except Exception as exc:
        logger.exception("Stockout risk prediction failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stockout risk prediction failed: {str(exc)}",
        ) from exc


@router.post("/demand-forecast", response_model=dict[str, Any])
def forecast_demand(
    request: DemandForecastRequest,
    service: PredictiveInferenceService = Depends(get_inference_service),
) -> dict[str, Any]:
    """Generate multi-horizon (7d, 30d, 90d) forward demand forecast with confidence intervals."""
    try:
        result = service.forecast_demand(request)
        return {"success": True, "data": result.model_dump(), "error": None}
    except Exception as exc:
        logger.exception("Demand forecasting failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Demand forecasting failed: {str(exc)}",
        ) from exc


@router.post("/simulate-scenario", response_model=dict[str, Any])
def simulate_scenario(
    request: MonteCarloSimulationRequest,
    engine: MonteCarloSimulationEngine = Depends(get_simulation_engine),
) -> dict[str, Any]:
    """Execute quantitative Monte Carlo simulation for demand surges, supplier delays, and profit impact."""
    try:
        result = engine.simulate(request)
        return {"success": True, "data": result.model_dump(), "error": None}
    except Exception as exc:
        logger.exception("Scenario simulation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Scenario simulation failed: {str(exc)}",
        ) from exc


@router.get("/models/manifest", response_model=dict[str, Any])
def get_predictive_models_manifest(
    service: PredictiveInferenceService = Depends(get_inference_service),
) -> dict[str, Any]:
    """Retrieve metadata, evaluation metrics, and operational readiness for all trained ML models."""
    manifest = service.get_manifest()
    return {"success": True, "data": manifest, "error": None}

