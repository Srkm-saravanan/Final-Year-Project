from __future__ import annotations

import logging
from typing import Any
from cortex_intelligence.agents.models import (
    AgentFactualClaim,
    AgentRole,
    ConsolidatedDecision,
    DeliberationState,
    RiskAssessment,
    RiskChallenge,
    SpecialistFinding,
)
from cortex_intelligence.agents.prompts import (
    FINANCE_AGENT_SYSTEM_PROMPT,
    MARKETING_AGENT_SYSTEM_PROMPT,
    OPERATIONS_AGENT_SYSTEM_PROMPT,
    RISK_AGENT_SYSTEM_PROMPT,
    STRATEGY_SUPERVISOR_SYSTEM_PROMPT,
    format_evidence_summary,
    format_previous_findings,
)
from cortex_intelligence.llm.client import OllamaClient
from cortex_intelligence.llm.models import ChatMessage, ChatRole

logger = logging.getLogger("cortex_intelligence.agents.specialists")


async def execute_finance_turn(
    client: OllamaClient,
    state: DeliberationState,
) -> tuple[SpecialistFinding, int, float]:
    """Execute Finance Agent reasoning turn."""
    evidence_text = format_evidence_summary(state.graphrag_evidence)
    previous_text = format_previous_findings(state, AgentRole.FINANCE)

    prompt = (
        f"**Business Query:** {state.user_query}\n\n"
        f"{evidence_text}\n\n"
        f"{previous_text}\n\n"
        "Provide your structured financial assessment. Emphasize margin impact, working capital, "
        "and expediting tradeoffs. Every factual or quantitative claim must reference an evidence ID."
    )

    messages = [ChatMessage(role=ChatRole.USER, content=prompt)]
    res = await client.generate_structured(
        messages=messages,
        response_schema=SpecialistFinding,
        system_instruction=FINANCE_AGENT_SYSTEM_PROMPT,
        temperature=0.2,
    )

    if res.success and res.data:
        finding = res.data
        finding.agent_role = AgentRole.FINANCE
        finding.agent_name = "Finance Agent"
        return finding, res.eval_tokens or 0, res.latency_ms or 0.0

    logger.warning("Finance Agent fallback triggered: %s", res.error)
    # Safe fallback if generation failed
    fallback = SpecialistFinding(
        agent_role=AgentRole.FINANCE,
        agent_name="Finance Agent",
        key_analysis=f"Unable to complete full financial reasoning due to model error: {res.error}",
        quantitative_estimates={"status": "unverified"},
        concerns_or_limitations=["Model inference failed or produced non-conforming schema."],
        recommendation_stance="DEFER",
        confidence=0.3,
    )
    return fallback, 0, res.latency_ms or 0.0


async def execute_operations_turn(
    client: OllamaClient,
    state: DeliberationState,
) -> tuple[SpecialistFinding, int, float]:
    """Execute Operations Agent reasoning turn."""
    evidence_text = format_evidence_summary(state.graphrag_evidence)
    previous_text = format_previous_findings(state, AgentRole.OPERATIONS)

    prompt = (
        f"**Business Query:** {state.user_query}\n\n"
        f"{evidence_text}\n\n"
        f"{previous_text}\n\n"
        "Provide your structured operations assessment. Analyze PO delays, affected warehouses, "
        "inventory safety stock, and replenishment feasibility. Reference verified evidence IDs."
    )

    messages = [ChatMessage(role=ChatRole.USER, content=prompt)]
    res = await client.generate_structured(
        messages=messages,
        response_schema=SpecialistFinding,
        system_instruction=OPERATIONS_AGENT_SYSTEM_PROMPT,
        temperature=0.2,
    )

    if res.success and res.data:
        finding = res.data
        finding.agent_role = AgentRole.OPERATIONS
        finding.agent_name = "Operations Agent"
        return finding, res.eval_tokens or 0, res.latency_ms or 0.0

    logger.warning("Operations Agent fallback triggered: %s", res.error)
    fallback = SpecialistFinding(
        agent_role=AgentRole.OPERATIONS,
        agent_name="Operations Agent",
        key_analysis=f"Operations analysis deferred due to generation error: {res.error}",
        quantitative_estimates={"status": "unverified"},
        concerns_or_limitations=["Operational bottleneck assessment could not be validated."],
        recommendation_stance="DEFER",
        confidence=0.3,
    )
    return fallback, 0, res.latency_ms or 0.0


async def execute_marketing_turn(
    client: OllamaClient,
    state: DeliberationState,
) -> tuple[SpecialistFinding, int, float]:
    """Execute Marketing Agent reasoning turn."""
    evidence_text = format_evidence_summary(state.graphrag_evidence)
    previous_text = format_previous_findings(state, AgentRole.MARKETING)

    prompt = (
        f"**Business Query:** {state.user_query}\n\n"
        f"{evidence_text}\n\n"
        f"{previous_text}\n\n"
        "Provide your structured marketing assessment. Evaluate customer demand velocity, "
        "regional delivery SLA risk, customer retention impact, and brand trust. Reference evidence IDs."
    )

    messages = [ChatMessage(role=ChatRole.USER, content=prompt)]
    res = await client.generate_structured(
        messages=messages,
        response_schema=SpecialistFinding,
        system_instruction=MARKETING_AGENT_SYSTEM_PROMPT,
        temperature=0.2,
    )

    if res.success and res.data:
        finding = res.data
        finding.agent_role = AgentRole.MARKETING
        finding.agent_name = "Marketing Agent"
        return finding, res.eval_tokens or 0, res.latency_ms or 0.0

    logger.warning("Marketing Agent fallback triggered: %s", res.error)
    fallback = SpecialistFinding(
        agent_role=AgentRole.MARKETING,
        agent_name="Marketing Agent",
        key_analysis=f"Customer demand assessment deferred: {res.error}",
        quantitative_estimates={"status": "unverified"},
        concerns_or_limitations=["Commercial demand correlation unavailable."],
        recommendation_stance="DEFER",
        confidence=0.3,
    )
    return fallback, 0, res.latency_ms or 0.0


async def execute_risk_turn(
    client: OllamaClient,
    state: DeliberationState,
) -> tuple[RiskAssessment, int, float]:
    """Execute Risk Agent reasoning turn (auditing and challenging prior findings)."""
    evidence_text = format_evidence_summary(state.graphrag_evidence)
    previous_text = format_previous_findings(state, AgentRole.RISK)

    prompt = (
        f"**Business Query:** {state.user_query}\n\n"
        f"{evidence_text}\n\n"
        f"{previous_text}\n\n"
        "Act as the Devil's Advocate. Critique and challenge the assertions made by Finance, "
        "Operations, and Marketing. Identify single-points-of-failure, optimistic assumptions, "
        "and missing evidence. Produce explicit structured 'challenges_to_previous_findings' "
        "and quantify the worst-case downside exposure."
    )

    messages = [ChatMessage(role=ChatRole.USER, content=prompt)]
    res = await client.generate_structured(
        messages=messages,
        response_schema=RiskAssessment,
        system_instruction=RISK_AGENT_SYSTEM_PROMPT,
        temperature=0.2,
    )

    if res.success and res.data:
        finding = res.data
        finding.agent_role = AgentRole.RISK
        finding.agent_name = "Risk Agent"
        return finding, res.eval_tokens or 0, res.latency_ms or 0.0

    logger.warning("Risk Agent fallback triggered: %s", res.error)
    fallback = RiskAssessment(
        agent_role=AgentRole.RISK,
        agent_name="Risk Agent",
        key_analysis=f"Risk audit fallback triggered: {res.error}",
        quantitative_estimates={"risk_level": "UNKNOWN"},
        concerns_or_limitations=["Unable to audit specialist assumptions."],
        recommendation_stance="OBJECT",
        confidence=0.4,
        challenges_to_previous_findings=[
            RiskChallenge(
                target_agent=AgentRole.OPERATIONS,
                challenge_point="Incomplete risk audit due to model fallback.",
                severity="HIGH",
                missing_evidence=["Complete vulnerability audit."],
            )
        ],
        downside_vulnerability="Unverified downside vulnerability.",
        worst_case_exposure="Unquantified disruption.",
    )
    return fallback, 0, res.latency_ms or 0.0


async def execute_supervisor_turn(
    client: OllamaClient,
    state: DeliberationState,
) -> tuple[ConsolidatedDecision, int, float]:
    """Execute Strategy Supervisor turn (consolidating consensus and final decision)."""
    evidence_text = format_evidence_summary(state.graphrag_evidence)
    previous_text = format_previous_findings(state, AgentRole.STRATEGY_SUPERVISOR)

    prompt = (
        f"**Business Query:** {state.user_query}\n\n"
        f"{evidence_text}\n\n"
        f"{previous_text}\n\n"
        "As the Strategy Supervisor, consolidate the findings from Finance, Operations, Marketing, "
        "and the Risk Agent challenges into a definitive organizational verdict (APPROVE, REJECT, "
        "CONDITIONALLY_APPROVE, or DEFER). Formulate an actionable execution plan and specify "
        "guardrail conditions. If evidence is partial or insufficient, select DEFER or CONDITIONALLY_APPROVE."
    )

    messages = [ChatMessage(role=ChatRole.USER, content=prompt)]
    res = await client.generate_structured(
        messages=messages,
        response_schema=ConsolidatedDecision,
        system_instruction=STRATEGY_SUPERVISOR_SYSTEM_PROMPT,
        temperature=0.2,
    )

    if res.success and res.data:
        decision = res.data
        # If evidence was flagged as insufficient earlier, enforce DEFER or guardrails
        if state.insufficient_evidence_flag:
            decision.evidence_sufficiency = "INSUFFICIENT"
            if decision.final_stance == "APPROVE":
                decision.final_stance = "DEFER"
                decision.guardrail_conditions.append(
                    "Automatic Guardrail: Decision deferred because no verifiable GraphRAG evidence exists."
                )
        return decision, res.eval_tokens or 0, res.latency_ms or 0.0

    logger.warning("Strategy Supervisor fallback triggered: %s", res.error)
    fallback = ConsolidatedDecision(
        decision_title="Deferred Decision (Supervisor Fallback)",
        final_stance="DEFER",
        confidence=0.3,
        executive_summary=f"Deliberation synthesis could not be completed reliably: {res.error}",
        consensus_points=[],
        unresolved_disagreements=["Supervisor inference failed."],
        action_plan=["Re-run deliberation or consult manual human review."],
        guardrail_conditions=["Do not proceed with operational changes without validated consensus."],
        citations_used=[],
        evidence_sufficiency="INSUFFICIENT",
    )
    return fallback, 0, res.latency_ms or 0.0

