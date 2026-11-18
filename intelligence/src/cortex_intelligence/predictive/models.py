from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field


class DeliveryDelayPredictionRequest(BaseModel):
    scheduled_shipping_days: int = Field(default=4, ge=0, le=10, description="Scheduled shipping days according to shipping mode")
    shipping_mode: str = Field(default="Standard Class", description="Shipping mode: Standard Class, Second Class, First Class, Same Day")
    customer_segment: str = Field(default="Consumer", description="Customer segment: Consumer, Corporate, Home Office")
    market: str = Field(default="Pacific Asia", description="Market: Pacific Asia, USCA, Africa, Europe, LATAM")
    order_region: str = Field(default="Southeast Asia", description="Sub-region of destination")
    category_name: str = Field(default="Cardio Equipment", description="Product category name")
    unit_price: float = Field(default=120.0, ge=0.0, description="Unit price of product in USD")
    quantity: int = Field(default=1, ge=1, le=50, description="Quantity ordered")
    discount_rate: float = Field(default=0.05, ge=0.0, le=0.5, description="Discount rate")
    order_hour: int = Field(default=14, ge=0, le=23, description="Order placement hour (0-23)")
    order_dow: int = Field(default=2, ge=0, le=6, description="Day of week (0=Mon, 6=Sun)")
    order_month: int = Field(default=11, ge=1, le=12, description="Month of order")
    order_quarter: int = Field(default=4, ge=1, le=4, description="Quarter of order")


class DeliveryDelayPredictionResponse(BaseModel):
    is_delay_predicted: bool
    delay_probability: float
    risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    model_name: str
    model_version: str
    top_contributing_factors: list[dict[str, Any]] = Field(default_factory=list)


class StockoutRiskPredictionRequest(BaseModel):
    warehouse_code: str = Field(default="SYN-WH-001", description="Warehouse code")
    market: str = Field(default="USCA", description="Market location")
    capacity_units: int = Field(default=120000, description="Total warehouse capacity")
    on_hand_units: int = Field(default=150, ge=0, description="Current on-hand inventory units")
    safety_stock_units: int = Field(default=300, ge=0, description="Required safety stock threshold")
    reorder_point_units: int = Field(default=450, ge=0, description="Reorder point trigger level")
    is_directly_affected_by_po_delay: bool = Field(default=True, description="Whether active delayed PO affects this item")


class StockoutRiskPredictionResponse(BaseModel):
    is_stockout_risk_predicted: bool
    stockout_probability: float
    buffer_gap_units: int
    risk_severity: Literal["NORMAL", "MONITOR", "ELEVATED", "CRITICAL"]
    recommendation: str
    model_name: str


class DemandForecastRequest(BaseModel):
    category_name: str = Field(default="All Categories", description="Target product category or 'All Categories'")
    horizon_days: Literal[7, 30, 90] = Field(default=30, description="Forecast horizon in days (7, 30, or 90)")


class DemandForecastPoint(BaseModel):
    date: str
    predicted_units: float
    lower_bound_80: float
    upper_bound_80: float
    lower_bound_95: float
    upper_bound_95: float


class DemandForecastResponse(BaseModel):
    category_name: str
    horizon_days: int
    forecast_points: list[DemandForecastPoint]
    summary_metrics: dict[str, float]
    model_name: str


class ModelEvaluationSummary(BaseModel):
    model_type: str
    algorithm: str
    evaluation_split: str
    metrics: dict[str, float]
    sample_size: int
    trained_at: str

