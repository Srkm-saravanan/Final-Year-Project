from __future__ import annotations

from typing import Any
from cortex_intelligence.agents.models import AgentRole, DeliberationState


FINANCE_AGENT_SYSTEM_PROMPT = """You are the CORTEX Finance Intelligence Agent.
Your core domain is Financial Analysis, Margin Optimization, Capital Allocation, and COGS Exposure.

Responsibilities:
1. Analyze financial impacts, unit margins, price elasticity tradeoffs, and expediting costs.
2. Calculate or evaluate margin compression, holding costs, and working capital exposure.
3. NEVER fabricate financial numbers. Use only figures explicitly present in the provided GraphRAG evidence or historical DataCo benchmark.
4. Every numerical claim must cite its supporting evidence ID (e.g., chunk ID or graph entity ID).
5. If financial data is missing or incomplete, explicitly state this in concerns_or_limitations and select recommendation_stance 'DEFER' or 'CONDITIONAL'.
"""

OPERATIONS_AGENT_SYSTEM_PROMPT = """You are the CORTEX Operations Intelligence Agent.
Your core domain is Supply Chain Logistics, Inventory Levels, Manufacturing Lead-Times, and Fulfillment Bottlenecks.

Responsibilities:
1. Analyze supplier delivery delays, affected purchase orders, destination warehouses, and below-safety-stock inventory slots.
2. Evaluate replenishment feasibility, warehouse buffer capacities, and transport corridor constraints.
3. Review the Finance Agent's financial perspective and correlate it with physical supply chain realities.
4. NEVER invent PO codes, delay days, warehouse names, or shortage counts. Base all assertions directly on the provided GraphRAG evidence.
5. If operational bottleneck data is ambiguous, explicitly state limitations and specify required operational clarifications.
"""

MARKETING_AGENT_SYSTEM_PROMPT = """You are the CORTEX Marketing Intelligence Agent.
Your core domain is Customer Demand, Regional Sales Velocity, Market Share, and Brand/Fulfillment Reputation.

Responsibilities:
1. Analyze the commercial and customer impact of the proposed decision and operational delays.
2. Evaluate regional demand velocity, product category criticality, and potential customer churn.
3. Review both Finance and Operations findings to evaluate whether customer satisfaction justifies cost premiums.
4. Cite verified DataCo product names, categories, and regional historical benchmarks from the evidence.
5. Identify any market segments at acute risk of delivery SLA breach.
"""

RISK_AGENT_SYSTEM_PROMPT = """You are the CORTEX Risk Intelligence Agent (The Devil's Advocate & Vulnerability Auditor).
Your core domain is Risk Mitigation, Downside Vulnerability, Single-Source Dependency, and Assumption Auditing.

Responsibilities:
1. CRITIQUE and CHALLENGE the assertions made by the Finance, Operations, and Marketing agents.
2. Identify optimistic biases, unstated assumptions, single-points-of-failure, and missing evidence.
3. Formulate structured 'RiskChallenges' specifying which agent is being challenged, the exact challenge point, and what evidence is lacking.
4. Quantify the worst-case downside exposure if operational mitigations fail.
5. Enforce strict skepticism: if previous agents recommend approval without sufficient verified data, strongly OBJECT or mark CONDITIONAL with hard stop triggers.
"""

STRATEGY_SUPERVISOR_SYSTEM_PROMPT = """You are the CORTEX Strategy Supervisor (Executive Decision Synthesizer).
Your role is to preside over the multi-agent deliberation, synthesize specialist findings, and formulate the final, authoritative organizational decision.

Responsibilities:
1. Synthesize the findings from Finance, Operations, and Marketing against the rigorous critique of the Risk Agent.
2. Identify areas of consensus and resolve conflicting domain recommendations with explicit trade-off rationale.
3. Formulate the definitive final_stance: APPROVE, REJECT, CONDITIONALLY_APPROVE, or DEFER.
4. If evidence is partial or insufficient, do NOT force an approval: select DEFER or CONDITIONALLY_APPROVE with strict guardrail stopping conditions.
5. Provide a clear, sequenced Action Plan and cite the key evidence IDs validating the final decision.
"""


def format_evidence_summary(evidence: dict[str, Any]) -> str:
    """Format GraphRAG evidence dictionary into structured markdown for agent prompts."""
    sections: list[str] = ["### VERIFIED GRAPHRAG EVIDENCE"]

    # 1. Chunks / Documents
    chunks = evidence.get("chunks") or []
    if chunks:
        sections.append("#### Document & Policy Excerpts:")
        for idx, ch in enumerate(chunks[:5], start=1):
            cid = ch.get("chunk_id") or f"C{idx}"
            title = ch.get("document_title") or "Document"
            preview = ch.get("text_preview") or ch.get("text") or ""
            sections.append(f"- **[{cid}]** *{title}*: \"{preview[:280]}...\"")
    else:
        sections.append("#### Document & Policy Excerpts: *No document chunks matched query.*")

    # 2. Synthetic PO Scenario
    syn = evidence.get("synthetic_scenario") or {}
    if syn:
        sections.append("\n#### Synthetic Procurement Delay Scenario (Simulated 2018):")
        sup = syn.get("supplier") or {}
        sections.append(
            f"- **Supplier:** `{sup.get('entityId', 'N/A')}` ({sup.get('name', 'N/A')}, Code: {sup.get('supplierCode', 'N/A')})"
        )
        sections.append(
            f"- **Delayed POs:** {syn.get('delayed_purchase_orders_count', 0)} out of {syn.get('total_purchase_orders', 0)} total POs"
        )
        sections.append(
            f"- **Holding Warehouses:** {syn.get('holding_warehouses_count', 0)} physical warehouses"
        )
        sections.append(
            f"- **Direct Shortage Inventory Slots:** {syn.get('directly_affected_shortage_inventory_count', 0)} affected slots"
        )

        pos = syn.get("delayed_purchase_orders") or []
        if pos:
            sections.append("  *Sample Delayed PO Details:*")
            for po in pos[:3]:
                sections.append(
                    f"    • PO `{po.get('poCode')}`: {po.get('delay_days')}d delay ({po.get('delay_severity')}) -> Destination: {po.get('destination_warehouse_name')} (Shortage: {po.get('shortage_units')} units of `{po.get('product_name')}`)"
                )

    # 3. Graph Paths
    paths = evidence.get("graph_paths") or []
    if paths:
        sections.append("\n#### Verified Neo4j Multi-Hop Graph Paths:")
        for idx, gp in enumerate(paths[:4], start=1):
            summary = gp.get("summary") if isinstance(gp, dict) else str(gp)
            sections.append(f"- **[G{idx}]** {summary}")

    # 4. Temporal Guardrail Note
    temp = evidence.get("temporal_filter") or {}
    if temp:
        sections.append(
            f"\n#### Temporal Governance Notice:\n- {temp.get('explanation', 'Historical data strictly benchmarked.')}"
        )

    return "\n".join(sections)


def format_previous_findings(state: DeliberationState, target_role: AgentRole) -> str:
    """Format previous agents' findings so the downstream agent can build on or challenge them."""
    blocks: list[str] = ["### PREVIOUS SPECIALIST FINDINGS"]
    has_prior = False

    if state.finance_finding and target_role != AgentRole.FINANCE:
        has_prior = True
        f = state.finance_finding
        blocks.append(
            f"#### 1. Finance Agent Finding ({f.recommendation_stance}, Confidence: {f.confidence:.2f}):\n"
            f"- **Analysis:** {f.key_analysis}\n"
            f"- **Metrics:** {f.quantitative_estimates}\n"
            f"- **Identified Concerns:** {', '.join(f.concerns_or_limitations) or 'None'}"
        )

    if state.operations_finding and target_role not in (AgentRole.FINANCE, AgentRole.OPERATIONS):
        has_prior = True
        op = state.operations_finding
        blocks.append(
            f"\n#### 2. Operations Agent Finding ({op.recommendation_stance}, Confidence: {op.confidence:.2f}):\n"
            f"- **Analysis:** {op.key_analysis}\n"
            f"- **Metrics:** {op.quantitative_estimates}\n"
            f"- **Identified Concerns:** {', '.join(op.concerns_or_limitations) or 'None'}"
        )

    if state.marketing_finding and target_role not in (AgentRole.FINANCE, AgentRole.OPERATIONS, AgentRole.MARKETING):
        has_prior = True
        m = state.marketing_finding
        blocks.append(
            f"\n#### 3. Marketing Agent Finding ({m.recommendation_stance}, Confidence: {m.confidence:.2f}):\n"
            f"- **Analysis:** {m.key_analysis}\n"
            f"- **Metrics:** {m.quantitative_estimates}\n"
            f"- **Identified Concerns:** {', '.join(m.concerns_or_limitations) or 'None'}"
        )

    if state.risk_assessment and target_role == AgentRole.STRATEGY_SUPERVISOR:
        has_prior = True
        r = state.risk_assessment
        challenges_txt = "\n".join(
            f"  • vs [{ch.target_agent.value if hasattr(ch.target_agent, 'value') else ch.target_agent}]: {ch.challenge_point} (Severity: {ch.severity}; Missing: {', '.join(ch.missing_evidence)})"
            for ch in r.challenges_to_previous_findings
        ) or "  • No formal challenges raised."
        blocks.append(
            f"\n#### 4. Risk Agent Assessment ({r.recommendation_stance}, Confidence: {r.confidence:.2f}):\n"
            f"- **Downside Vulnerability:** {r.downside_vulnerability}\n"
            f"- **Worst-Case Exposure:** {r.worst_case_exposure}\n"
            f"- **Cross-Agent Challenges:**\n{challenges_txt}"
        )

    if not has_prior:
        return "### PREVIOUS SPECIALIST FINDINGS: *(None. You are the first specialist to analyze this query.)*"

    return "\n".join(blocks)
