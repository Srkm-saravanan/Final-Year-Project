from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


class MonteCarloSimulationRequest(BaseModel):
    scenario_name: str = Field(default="Supplier Disruption & Demand Surge", description="Name of the scenario")
    iterations: int = Field(default=2000, ge=100, le=50000, description="Number of Monte Carlo iterations")
    
    # Shocks
    demand_shock_mean: float = Field(default=0.15, description="Expected fractional shift in demand (+0.15 = +15%)")
    demand_shock_std: float = Field(default=0.08, ge=0.0, description="Standard deviation of demand shock")
    supplier_delay_days_mean: float = Field(default=12.0, ge=0.0, description="Expected supplier delivery delay in days")
    supplier_delay_days_std: float = Field(default=4.0, ge=0.0, description="Standard deviation of supplier delay")
    procurement_cost_inflation_mean: float = Field(default=0.05, description="Expected cost inflation (+0.05 = +5%)")
    procurement_cost_inflation_std: float = Field(default=0.02, ge=0.0, description="Standard deviation of cost inflation")
    
    # Baseline Parameters
    baseline_daily_demand: float = Field(default=150.0, ge=1.0, description="Baseline daily unit demand")
    baseline_inventory_units: float = Field(default=1800.0, ge=0.0, description="Starting available inventory")
    safety_stock_units: float = Field(default=600.0, ge=0.0, description="Required safety buffer")
    simulation_horizon_days: int = Field(default=30, ge=1, le=180, description="Simulation duration in days")
    
    # Financial Parameters (USD)
    unit_sale_price_usd: float = Field(default=120.0, ge=0.1, description="Unit sales price")
    unit_cogs_usd: float = Field(default=65.0, ge=0.1, description="Unit baseline procurement cost")
    holding_cost_per_unit_day: float = Field(default=0.10, ge=0.0, description="Inventory carrying cost per unit per day")
    stockout_penalty_per_unit: float = Field(default=35.0, ge=0.0, description="Unmet demand penalty / churn loss per unit")
    expedited_freight_cost_usd: float = Field(default=0.0, ge=0.0, description="Optional cost of mitigation (e.g. emergency air freight)")
    expedited_lead_time_reduction_days: float = Field(default=0.0, ge=0.0, description="Days saved by expediting")


class SensitivityMetric(BaseModel):
    parameter: str
    variation: str
    expected_profit_impact_usd: float
    stockout_probability: float


class MonteCarloSimulationResponse(BaseModel):
    scenario_name: str
    iterations: int
    horizon_days: int
    
    # Financial Baseline vs Simulated
    baseline_gross_margin_usd: float
    simulated_gross_margin_mean_usd: float
    expected_profit_impact_usd: float
    expected_loss_usd: float
    
    # Risk & Downside Exposure
    stockout_probability: float
    mean_shortage_units: float
    value_at_risk_95_usd: float
    value_at_risk_99_usd: float
    conditional_var_95_usd: float
    probability_of_margin_compression: float
    
    # Distribution percentiles
    profit_impact_percentiles: dict[str, float]
    
    # Sensitivity Analysis
    sensitivity_analysis: list[SensitivityMetric]
    
    # Recommendation from risk profile
    executive_assessment: str

