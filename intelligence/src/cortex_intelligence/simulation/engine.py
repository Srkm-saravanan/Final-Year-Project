from __future__ import annotations

import logging
from typing import Any

import numpy as np

from cortex_intelligence.simulation.models import (
    MonteCarloSimulationRequest,
    MonteCarloSimulationResponse,
    SensitivityMetric,
)

logger = logging.getLogger("cortex_intelligence.simulation.engine")


class MonteCarloSimulationEngine:
    """Quantitative risk and scenario simulation engine executing vectorized Monte Carlo trials

    to evaluate multi-echelon supply disruptions, demand volatility, and margin compression.
    """

    def __init__(self, seed: int = 42) -> None:
        self.seed = seed

    def simulate(self, req: MonteCarloSimulationRequest) -> MonteCarloSimulationResponse:
        np.random.seed(self.seed)
        n = req.iterations
        horizon = req.simulation_horizon_days

        # 1. Deterministic Baseline Calculations (No disruption)
        base_demand_total = req.baseline_daily_demand * horizon
        base_revenue = base_demand_total * req.unit_sale_price_usd
        base_cogs = base_demand_total * req.unit_cogs_usd
        base_holding = (req.baseline_inventory_units / 2.0) * req.holding_cost_per_unit_day * horizon
        baseline_gross_margin = base_revenue - base_cogs - base_holding

        # 2. Vectorized Stochastic Shocks
        # Demand Shock: Normal distribution
        demand_shocks = np.random.normal(req.demand_shock_mean, req.demand_shock_std, size=n)
        sim_daily_demand = np.maximum(10.0, req.baseline_daily_demand * (1.0 + demand_shocks))
        sim_total_demand = sim_daily_demand * horizon

        # Supplier Delay Shocks: Truncated Normal / Positive Skewed
        delay_shocks = np.random.normal(req.supplier_delay_days_mean, req.supplier_delay_days_std, size=n)
        effective_delays = np.maximum(0.0, delay_shocks - req.expedited_lead_time_reduction_days)

        # Procurement Cost Inflation Shocks: Normal distribution
        cost_shocks = np.random.normal(req.procurement_cost_inflation_mean, req.procurement_cost_inflation_std, size=n)
        sim_unit_cogs = req.unit_cogs_usd * (1.0 + cost_shocks)

        # 3. Multi-Echelon Inventory Dynamics & Shortage Modeling
        # Daily depletion during disruption delay window
        depletion_during_delay = sim_daily_demand * effective_delays
        inventory_post_delay = req.baseline_inventory_units - depletion_during_delay

        # Shortages occur when buffer is breached below zero
        shortage_units = np.maximum(0.0, -inventory_post_delay)
        fulfilled_units = np.maximum(0.0, sim_total_demand - shortage_units)

        # Financial Impact Calculations per trial
        sim_revenue = fulfilled_units * req.unit_sale_price_usd
        sim_cogs = fulfilled_units * sim_unit_cogs
        sim_stockout_penalties = shortage_units * req.stockout_penalty_per_unit
        sim_holding_costs = np.maximum(0.0, inventory_post_delay / 2.0) * req.holding_cost_per_unit_day * horizon
        sim_expedited_costs = np.full(n, req.expedited_freight_cost_usd)

        sim_gross_margin = sim_revenue - sim_cogs - sim_holding_costs - sim_stockout_penalties - sim_expedited_costs
        profit_impact = sim_gross_margin - baseline_gross_margin

        # 4. Statistical Metrics & Risk Exposure
        mean_sim_margin = float(np.mean(sim_gross_margin))
        expected_profit_impact = float(np.mean(profit_impact))
        stockout_trials = int(np.sum(shortage_units > 0))
        stockout_prob = float(stockout_trials / n)
        mean_shortage = float(np.mean(shortage_units))

        # Expected Loss (conditioned on negative impact)
        loss_trials = profit_impact[profit_impact < 0]
        expected_loss = float(-np.mean(loss_trials)) if len(loss_trials) > 0 else 0.0

        # Value at Risk (VaR) & Conditional VaR (CVaR)
        # VaR represents the dollar downside loss threshold at specific confidence levels
        var_95 = float(-np.percentile(profit_impact, 5))
        var_99 = float(-np.percentile(profit_impact, 1))

        tail_5 = profit_impact[profit_impact <= np.percentile(profit_impact, 5)]
        cvar_95 = float(-np.mean(tail_5)) if len(tail_5) > 0 else var_95

        prob_margin_compression = float(np.mean(profit_impact < 0))

        # Percentile Distribution
        percentiles = {
            "p5_worst": round(float(np.percentile(profit_impact, 5)), 2),
            "p25": round(float(np.percentile(profit_impact, 25)), 2),
            "p50_median": round(float(np.percentile(profit_impact, 50)), 2),
            "p75": round(float(np.percentile(profit_impact, 75)), 2),
            "p95_best": round(float(np.percentile(profit_impact, 95)), 2),
        }

        # 5. Sensitivity Analysis Variations
        sensitivities = self._calculate_sensitivities(req)

        # 6. Executive Risk Assessment
        if stockout_prob > 0.60 or var_95 > 25000:
            assessment = "CRITICAL RISK: Severe vulnerability to stockout and substantial tail risk. Mitigation or supplier rerouting strongly recommended."
        elif stockout_prob > 0.25:
            assessment = "ELEVATED RISK: Moderate stockout exposure. Expedited freight or safety stock escalation advised."
        else:
            assessment = "STABLE RISK PROFILE: Supply buffers are resilient to current volatility assumptions."

        return MonteCarloSimulationResponse(
            scenario_name=req.scenario_name,
            iterations=n,
            horizon_days=horizon,
            baseline_gross_margin_usd=round(baseline_gross_margin, 2),
            simulated_gross_margin_mean_usd=round(mean_sim_margin, 2),
            expected_profit_impact_usd=round(expected_profit_impact, 2),
            expected_loss_usd=round(expected_loss, 2),
            stockout_probability=round(stockout_prob, 4),
            mean_shortage_units=round(mean_shortage, 2),
            value_at_risk_95_usd=round(max(0.0, var_95), 2),
            value_at_risk_99_usd=round(max(0.0, var_99), 2),
            conditional_var_95_usd=round(max(0.0, cvar_95), 2),
            probability_of_margin_compression=round(prob_margin_compression, 4),
            profit_impact_percentiles=percentiles,
            sensitivity_analysis=sensitivities,
            executive_assessment=assessment,
        )

    def _calculate_sensitivities(self, req: MonteCarloSimulationRequest) -> list[SensitivityMetric]:
        sensitivities: list[SensitivityMetric] = []

        # Variation 1: Demand Surge (+30%)
        req_d_high = req.model_copy(update={"demand_shock_mean": req.demand_shock_mean + 0.15})
        d_res = self._quick_simulate(req_d_high)
        sensitivities.append(
            SensitivityMetric(
                parameter="Demand Shock",
                variation="+30% Demand Surge",
                expected_profit_impact_usd=d_res[0],
                stockout_probability=d_res[1],
            )
        )

        # Variation 2: Demand Drop (-20%)
        req_d_low = req.model_copy(update={"demand_shock_mean": req.demand_shock_mean - 0.20})
        d_low_res = self._quick_simulate(req_d_low)
        sensitivities.append(
            SensitivityMetric(
                parameter="Demand Shock",
                variation="-20% Demand Slump",
                expected_profit_impact_usd=d_low_res[0],
                stockout_probability=d_low_res[1],
            )
        )

        # Variation 3: Supplier Delay Extended (+7 days)
        req_delay_high = req.model_copy(update={"supplier_delay_days_mean": req.supplier_delay_days_mean + 7.0})
        del_res = self._quick_simulate(req_delay_high)
        sensitivities.append(
            SensitivityMetric(
                parameter="Supplier Disruption",
                variation="+7 Days Additional Delay",
                expected_profit_impact_usd=del_res[0],
                stockout_probability=del_res[1],
            )
        )

        # Variation 4: Procurement Cost Surge (+15%)
        req_cogs_high = req.model_copy(update={"procurement_cost_inflation_mean": req.procurement_cost_inflation_mean + 0.10})
        cogs_res = self._quick_simulate(req_cogs_high)
        sensitivities.append(
            SensitivityMetric(
                parameter="Cost Inflation",
                variation="+10% COGS Inflation",
                expected_profit_impact_usd=cogs_res[0],
                stockout_probability=cogs_res[1],
            )
        )

        return sensitivities

    def _quick_simulate(self, req: MonteCarloSimulationRequest, n: int = 500) -> tuple[float, float]:
        horizon = req.simulation_horizon_days
        base_demand_total = req.baseline_daily_demand * horizon
        baseline_gross_margin = (
            base_demand_total * (req.unit_sale_price_usd - req.unit_cogs_usd)
            - (req.baseline_inventory_units / 2.0) * req.holding_cost_per_unit_day * horizon
        )

        demand_shocks = np.random.normal(req.demand_shock_mean, req.demand_shock_std, size=n)
        sim_daily_demand = np.maximum(10.0, req.baseline_daily_demand * (1.0 + demand_shocks))
        sim_total_demand = sim_daily_demand * horizon

        delay_shocks = np.random.normal(req.supplier_delay_days_mean, req.supplier_delay_days_std, size=n)
        effective_delays = np.maximum(0.0, delay_shocks - req.expedited_lead_time_reduction_days)

        cost_shocks = np.random.normal(req.procurement_cost_inflation_mean, req.procurement_cost_inflation_std, size=n)
        sim_unit_cogs = req.unit_cogs_usd * (1.0 + cost_shocks)

        depletion_during_delay = sim_daily_demand * effective_delays
        inventory_post_delay = req.baseline_inventory_units - depletion_during_delay

        shortage_units = np.maximum(0.0, -inventory_post_delay)
        fulfilled_units = np.maximum(0.0, sim_total_demand - shortage_units)

        sim_revenue = fulfilled_units * req.unit_sale_price_usd
        sim_cogs = fulfilled_units * sim_unit_cogs
        sim_stockout_penalties = shortage_units * req.stockout_penalty_per_unit
        sim_holding_costs = np.maximum(0.0, inventory_post_delay / 2.0) * req.holding_cost_per_unit_day * horizon

        sim_gross_margin = (
            sim_revenue
            - sim_cogs
            - sim_holding_costs
            - sim_stockout_penalties
            - req.expedited_freight_cost_usd
        )
        profit_impact = float(np.mean(sim_gross_margin - baseline_gross_margin))
        stockout_prob = float(np.mean(shortage_units > 0))

        return round(profit_impact, 2), round(stockout_prob, 4)

