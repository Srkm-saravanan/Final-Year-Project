from __future__ import annotations

import asyncio
from typing import Any
import httpx
import pytest
from fastapi.testclient import TestClient

from cortex_intelligence.agents.models import (
    AgentFactualClaim,
    AgentRole,
    ConsolidatedDecision,
    DeliberationRequest,
    DeliberationState,
    RiskAssessment,
    RiskChallenge,
    SpecialistFinding,
)
from cortex_intelligence.agents.orchestrator import (
    DeliberationRegistry,
    SequentialDeliberationOrchestrator,
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
from cortex_intelligence.api.main import create_app
from cortex_intelligence.config import get_settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.llm.client import OllamaClient
from cortex_intelligence.models.canonical import utc_now_iso


def test_agents_have_different_responsibilities_and_prompts():
    """Verify that all 5 agents have distinct system prompts and clear responsibilities."""
    prompts = [
        FINANCE_AGENT_SYSTEM_PROMPT,
        OPERATIONS_AGENT_SYSTEM_PROMPT,
        MARKETING_AGENT_SYSTEM_PROMPT,
        RISK_AGENT_SYSTEM_PROMPT,
        STRATEGY_SUPERVISOR_SYSTEM_PROMPT,
    ]
    # Verify uniqueness of all 5 prompts
    assert len(set(prompts)) == 5
    # Verify domain-specific keywords
    assert "Margin Optimization" in FINANCE_AGENT_SYSTEM_PROMPT
    assert "Supply Chain Logistics" in OPERATIONS_AGENT_SYSTEM_PROMPT
    assert "Customer Demand" in MARKETING_AGENT_SYSTEM_PROMPT
    assert "Devil's Advocate" in RISK_AGENT_SYSTEM_PROMPT
    assert "Executive Decision Synthesizer" in STRATEGY_SUPERVISOR_SYSTEM_PROMPT


def test_evidence_and_findings_formatting_pipeline():
    """Verify that GraphRAG evidence and previous findings correctly format into prompt text."""
    evidence = {
        "chunks": [
            {
                "chunk_id": "doc:test:chunk:1",
                "document_title": "Supplier Delay SOP",
                "text_preview": "Flagship vendors experiencing >10 days delay require VP approval.",
            }
        ],
        "synthetic_scenario": {
            "supplier": {"name": "Synthetic Vendor 001", "entityId": "syn:supplier:SYN-SUP-001"},
            "delayed_purchase_orders_count": 15,
            "total_purchase_orders": 20,
            "holding_warehouses_count": 8,
            "directly_affected_shortage_inventory_count": 12,
            "delayed_purchase_orders": [
                {
                    "poCode": "SYN-PO-0004",
                    "delay_days": 14,
                    "delay_severity": "Critical",
                    "destination_warehouse_name": "Synthetic Warehouse APAC-East",
                    "shortage_units": 18,
                    "product_name": "Running Shoe",
                }
            ],
        },
        "graph_paths": ["SYN-SUP-001 -[:HAS_DELAY]-> SYN-PO-0004"],
    }

    evidence_md = format_evidence_summary(evidence)
    assert "doc:test:chunk:1" in evidence_md
    assert "Synthetic Vendor 001" in evidence_md
    assert "SYN-PO-0004" in evidence_md
    assert "14d delay" in evidence_md

    # Test state propagation across turns
    state = DeliberationState(
        session_id="test-session",
        user_query="Expedite shipment?",
        created_at=utc_now_iso(),
        graphrag_evidence=evidence,
    )

    # 1. Initially, no prior findings for Finance
    assert "None. You are the first specialist" in format_previous_findings(state, AgentRole.FINANCE)

    # 2. Add Finance finding
    state.finance_finding = SpecialistFinding(
        agent_role=AgentRole.FINANCE,
        agent_name="Finance Agent",
        key_analysis="Expedited air freight costs $12,500 but saves $45,000 margin.",
        quantitative_estimates={"freight_cost": 12500, "margin_protected": 45000},
        recommendation_stance="SUPPORT",
        confidence=0.88,
    )

    # Operations should see Finance
    ops_prompt = format_previous_findings(state, AgentRole.OPERATIONS)
    assert "Finance Agent Finding (SUPPORT" in ops_prompt
    assert "$12,500" in ops_prompt

    # 3. Add Operations finding
    state.operations_finding = SpecialistFinding(
        agent_role=AgentRole.OPERATIONS,
        agent_name="Operations Agent",
        key_analysis="APAC-East warehouse has only 2 days of buffer stock remaining.",
        quantitative_estimates={"shortage_units": 18, "buffer_days": 2},
        recommendation_stance="SUPPORT",
        confidence=0.92,
    )

    # Marketing should see Finance and Operations
    mkt_prompt = format_previous_findings(state, AgentRole.MARKETING)
    assert "Finance Agent Finding" in mkt_prompt
    assert "Operations Agent Finding" in mkt_prompt
    assert "APAC-East warehouse" in mkt_prompt

    # 4. Add Risk finding with challenges
    state.risk_assessment = RiskAssessment(
        agent_role=AgentRole.RISK,
        agent_name="Risk Agent",
        key_analysis="High risk of secondary port customs hold.",
        challenges_to_previous_findings=[
            RiskChallenge(
                target_agent=AgentRole.OPERATIONS,
                challenge_point="APAC-East flight slot availability is unverified.",
                severity="HIGH",
                missing_evidence=["Airway bill slot confirmation."],
            )
        ],
        downside_vulnerability="Customs clearance hold could negate expedited flight.",
        worst_case_exposure="$12,500 wasted with zero lead-time reduction.",
        recommendation_stance="CONDITIONAL",
        confidence=0.85,
    )

    # Strategy Supervisor should see all 4 findings, including Risk challenges
    sup_prompt = format_previous_findings(state, AgentRole.STRATEGY_SUPERVISOR)
    assert "Finance Agent Finding" in sup_prompt
    assert "Operations Agent Finding" in sup_prompt
    assert "Risk Agent Assessment" in sup_prompt
    assert "vs [operations]: APAC-East flight slot availability is unverified" in sup_prompt


@pytest.mark.anyio
async def test_sequential_execution_and_state_sharing_mocked():
    """Verify that all 5 agents execute in strict sequential order and pass findings downstream."""
    settings = get_settings()
    neo4j_client = Neo4jClient(settings)

    call_order: list[AgentRole] = []
    received_prompts: dict[AgentRole, str] = {}

    async with OllamaClient(settings) as mock_ollama:
        async def mock_generate_structured(messages: list[Any], response_schema: type, system_instruction: str = "", **kwargs: Any) -> Any:
            user_content = messages[-1].content
            from cortex_intelligence.llm.models import StructuredGenerationResult

            if response_schema == SpecialistFinding and "Finance Intelligence Agent" in system_instruction:
                call_order.append(AgentRole.FINANCE)
                received_prompts[AgentRole.FINANCE] = user_content
                return StructuredGenerationResult(
                    success=True,
                    data=SpecialistFinding(
                        agent_role=AgentRole.FINANCE,
                        agent_name="Finance Agent",
                        key_analysis="Financial viability confirmed.",
                        quantitative_estimates={"budget_impact_usd": 15000},
                        recommendation_stance="SUPPORT",
                        confidence=0.9,
                    ),
                    raw_content="",
                    eval_tokens=50,
                    latency_ms=10.0,
                )

            elif response_schema == SpecialistFinding and "Operations Intelligence Agent" in system_instruction:
                call_order.append(AgentRole.OPERATIONS)
                received_prompts[AgentRole.OPERATIONS] = user_content
                return StructuredGenerationResult(
                    success=True,
                    data=SpecialistFinding(
                        agent_role=AgentRole.OPERATIONS,
                        agent_name="Operations Agent",
                        key_analysis="Fulfillment route verified.",
                        quantitative_estimates={"affected_pos": 1},
                        recommendation_stance="SUPPORT",
                        confidence=0.85,
                    ),
                    raw_content="",
                    eval_tokens=50,
                    latency_ms=10.0,
                )

            elif response_schema == SpecialistFinding and "Marketing Intelligence Agent" in system_instruction:
                call_order.append(AgentRole.MARKETING)
                received_prompts[AgentRole.MARKETING] = user_content
                return StructuredGenerationResult(
                    success=True,
                    data=SpecialistFinding(
                        agent_role=AgentRole.MARKETING,
                        agent_name="Marketing Agent",
                        key_analysis="Customer churn risk mitigated.",
                        quantitative_estimates={"sla_protection_pct": 95},
                        recommendation_stance="SUPPORT",
                        confidence=0.88,
                    ),
                    raw_content="",
                    eval_tokens=50,
                    latency_ms=10.0,
                )

            elif response_schema == RiskAssessment:
                call_order.append(AgentRole.RISK)
                received_prompts[AgentRole.RISK] = user_content
                return StructuredGenerationResult(
                    success=True,
                    data=RiskAssessment(
                        agent_role=AgentRole.RISK,
                        agent_name="Risk Agent",
                        key_analysis="Challenging reliance on single-lane air freight.",
                        challenges_to_previous_findings=[
                            RiskChallenge(
                                target_agent=AgentRole.OPERATIONS,
                                challenge_point="Airway slot unconfirmed.",
                                severity="HIGH",
                                missing_evidence=["Carrier booking reference."],
                            )
                        ],
                        downside_vulnerability="Flight cancellation.",
                        worst_case_exposure="Delayed delivery.",
                        recommendation_stance="CONDITIONAL",
                        confidence=0.85,
                    ),
                    raw_content="",
                    eval_tokens=60,
                    latency_ms=12.0,
                )

            elif response_schema == ConsolidatedDecision:
                call_order.append(AgentRole.STRATEGY_SUPERVISOR)
                received_prompts[AgentRole.STRATEGY_SUPERVISOR] = user_content
                return StructuredGenerationResult(
                    success=True,
                    data=ConsolidatedDecision(
                        decision_title="Conditionally Approve Emergency Freight",
                        final_stance="CONDITIONALLY_APPROVE",
                        confidence=0.87,
                        executive_summary="Approved subject to carrier slot confirmation.",
                        consensus_points=["Criticality of customer order."],
                        unresolved_disagreements=["Risk of flight cancellation."],
                        action_plan=["Confirm airway bill", "Release payment"],
                        guardrail_conditions=["Require carrier confirmation within 4 hours"],
                        citations_used=["doc:test:chunk:1"],
                        evidence_sufficiency="SUFFICIENT",
                    ),
                    raw_content="",
                    eval_tokens=80,
                    latency_ms=15.0,
                )

            raise ValueError(f"Unexpected schema: {response_schema}")

        mock_ollama.generate_structured = mock_generate_structured  # type: ignore[method-assign]

        orchestrator = SequentialDeliberationOrchestrator(
            ollama_client=mock_ollama,
            neo4j_client=neo4j_client,
            settings=settings,
        )

        request = DeliberationRequest(
            query="Should we approve emergency air freight for delayed PO SYN-PO-0004?",
            as_of_date="2026-11-12",
        )

        state = await orchestrator.run_deliberation(request)

        # 1. Verify strict execution order
        assert call_order == [
            AgentRole.FINANCE,
            AgentRole.OPERATIONS,
            AgentRole.MARKETING,
            AgentRole.RISK,
            AgentRole.STRATEGY_SUPERVISOR,
        ]
        assert state.execution_order == call_order

        # 2. Verify state sharing: Operations saw Finance
        assert "Finance Agent Finding" in received_prompts[AgentRole.OPERATIONS]
        # Marketing saw Finance + Operations
        assert "Finance Agent Finding" in received_prompts[AgentRole.MARKETING]
        assert "Operations Agent Finding" in received_prompts[AgentRole.MARKETING]
        # Risk saw all 3
        assert "Finance Agent Finding" in received_prompts[AgentRole.RISK]
        assert "Operations Agent Finding" in received_prompts[AgentRole.RISK]
        assert "Marketing Agent Finding" in received_prompts[AgentRole.RISK]
        # Strategy Supervisor saw Risk challenge
        assert "Airway slot unconfirmed" in received_prompts[AgentRole.STRATEGY_SUPERVISOR]

        # 3. Verify final consolidated decision
        assert state.status == "COMPLETED"
        assert state.supervisor_decision is not None
        assert state.supervisor_decision.final_stance == "CONDITIONALLY_APPROVE"
        assert len(state.supervisor_decision.guardrail_conditions) >= 1
        assert state.total_eval_tokens > 0


@pytest.mark.anyio
async def test_insufficient_evidence_grounding_rejection():
    """Verify that out-of-scope or unevidenced queries force an INSUFFICIENT / DEFER decision."""
    settings = get_settings()
    neo4j_client = Neo4jClient(settings)

    async with OllamaClient(settings) as mock_ollama:
        async def mock_generate_structured(messages: list[Any], response_schema: type, **kwargs: Any) -> Any:
            from cortex_intelligence.llm.models import StructuredGenerationResult
            if response_schema == SpecialistFinding:
                return StructuredGenerationResult(
                    success=True,
                    data=SpecialistFinding(
                        agent_role=AgentRole.FINANCE,
                        agent_name="Finance Agent",
                        key_analysis="No relevant financial evidence found.",
                        recommendation_stance="DEFER",
                        confidence=0.2,
                    ),
                    raw_content="",
                )
            elif response_schema == RiskAssessment:
                return StructuredGenerationResult(
                    success=True,
                    data=RiskAssessment(
                        agent_role=AgentRole.RISK,
                        agent_name="Risk Agent",
                        key_analysis="Complete absence of verifiable data.",
                        recommendation_stance="OBJECT",
                        confidence=0.1,
                    ),
                    raw_content="",
                )
            elif response_schema == ConsolidatedDecision:
                return StructuredGenerationResult(
                    success=True,
                    data=ConsolidatedDecision(
                        decision_title="Deferred: No Evidence Available",
                        final_stance="APPROVE",  # Deliberately tests supervisor override
                        confidence=0.2,
                        executive_summary="Attempted approval despite zero data.",
                    ),
                    raw_content="",
                )

        mock_ollama.generate_structured = mock_generate_structured  # type: ignore[method-assign]

        orchestrator = SequentialDeliberationOrchestrator(
            ollama_client=mock_ollama,
            neo4j_client=neo4j_client,
            settings=settings,
        )

        # Completely out-of-scope query returning zero chunks and zero graph entities
        request = DeliberationRequest(
            query="What is the forecasted spot price of Ethereum in December 2028?",
            as_of_date="2026-11-12",
        )

        state = await orchestrator.run_deliberation(request)
        assert state.insufficient_evidence_flag is True
        assert state.supervisor_decision is not None
        # Enforce that orchestrator overrides any rogue approval to DEFER
        assert state.supervisor_decision.final_stance == "DEFER"
        assert state.supervisor_decision.evidence_sufficiency == "INSUFFICIENT"
        assert any("Automatic Guardrail" in g for g in state.supervisor_decision.guardrail_conditions)


@pytest.mark.anyio
async def test_agent_failure_and_graceful_recovery():
    """Verify that an individual agent failure does not crash the sequential deliberation pipeline."""
    settings = get_settings()
    neo4j_client = Neo4jClient(settings)

    async with OllamaClient(settings) as mock_ollama:
        async def mock_generate_structured(messages: list[Any], response_schema: type, **kwargs: Any) -> Any:
            from cortex_intelligence.llm.models import StructuredGenerationResult
            # Simulate failure during Finance agent execution
            if response_schema == SpecialistFinding and "Finance" in str(kwargs.get("system_instruction", "")):
                return StructuredGenerationResult(
                    success=False,
                    data=None,
                    error="Simulated LLM network drop during finance turn",
                    raw_content="",
                )
            elif response_schema == SpecialistFinding:
                return StructuredGenerationResult(
                    success=True,
                    data=SpecialistFinding(
                        agent_role=AgentRole.OPERATIONS,
                        agent_name="Operations Agent",
                        key_analysis="Operations proceeds despite finance gap.",
                        recommendation_stance="CONDITIONAL",
                        confidence=0.7,
                    ),
                    raw_content="",
                )
            elif response_schema == RiskAssessment:
                return StructuredGenerationResult(
                    success=True,
                    data=RiskAssessment(
                        agent_role=AgentRole.RISK,
                        agent_name="Risk Agent",
                        key_analysis="Risk highlights the missing finance input.",
                        recommendation_stance="CONDITIONAL",
                        confidence=0.75,
                    ),
                    raw_content="",
                )
            elif response_schema == ConsolidatedDecision:
                return StructuredGenerationResult(
                    success=True,
                    data=ConsolidatedDecision(
                        decision_title="Conditional Approval with Finance Review",
                        final_stance="CONDITIONALLY_APPROVE",
                        confidence=0.70,
                        executive_summary="Approved pending manual finance verification.",
                    ),
                    raw_content="",
                )

        mock_ollama.generate_structured = mock_generate_structured  # type: ignore[method-assign]

        orchestrator = SequentialDeliberationOrchestrator(
            ollama_client=mock_ollama,
            neo4j_client=neo4j_client,
            settings=settings,
        )

        request = DeliberationRequest(query="Evaluate supplier inventory replenishment.")
        state = await orchestrator.run_deliberation(request)

        assert state.status == "COMPLETED"
        assert state.finance_finding is not None
        assert state.finance_finding.recommendation_stance == "DEFER"
        assert "Simulated LLM network drop" in state.finance_finding.key_analysis
        # The remaining 4 agents still completed successfully
        assert state.operations_finding is not None
        assert state.marketing_finding is not None
        assert state.risk_assessment is not None
        assert state.supervisor_decision is not None


def test_fastapi_agents_routes():
    """Verify FastAPI /api/v1/agents endpoints with authentication."""
    settings = get_settings()
    app = create_app(settings_override=settings)
    api_key = settings.intelligence_api_key

    with TestClient(app) as test_client:
        # 1. Unauthorized without key
        res_unauth = test_client.get("/api/v1/agents/manifest")
        assert res_unauth.status_code == 401

        # 2. Authorized manifest check
        headers = {"X-Cortex-Service-Key": api_key}
        res_manifest = test_client.get("/api/v1/agents/manifest", headers=headers)
        assert res_manifest.status_code == 200
        manifest_data = res_manifest.json()
        assert manifest_data["success"] is True
        agents = manifest_data["data"]["agents"]
        assert len(agents) == 5
        roles = [a["role"] for a in agents]
        assert roles == ["finance", "operations", "marketing", "risk", "strategy_supervisor"]

        # 3. Test retrieving non-existent deliberation
        res_not_found = test_client.get("/api/v1/agents/deliberations/delib-nonexistent", headers=headers)
        assert res_not_found.status_code == 404


@pytest.mark.anyio
async def test_live_ollama_five_agent_deliberation():
    """End-to-end verification: Execute live 5-agent deliberation on local cortex-qwen and Neo4j."""
    settings = get_settings()
    neo4j_client = Neo4jClient(settings)

    async with OllamaClient(settings) as ollama_client:
        orchestrator = SequentialDeliberationOrchestrator(
            ollama_client=ollama_client,
            neo4j_client=neo4j_client,
            settings=settings,
        )

        request = DeliberationRequest(
            query="Should we authorize an emergency expedited logistics run for flagship supplier SYN-SUP-001 experiencing a 14-day delay on purchase order SYN-PO-0004?",
            as_of_date="2026-11-12",
            top_k=4,
        )

        state = await orchestrator.run_deliberation(request)

        # 1. Check all 5 agents executed in sequential order
        assert state.status == "COMPLETED"
        assert state.execution_order == [
            AgentRole.FINANCE,
            AgentRole.OPERATIONS,
            AgentRole.MARKETING,
            AgentRole.RISK,
            AgentRole.STRATEGY_SUPERVISOR,
        ]

        # 2. Check GraphRAG evidence was retrieved and reached agents
        assert state.retrieved_chunk_count > 0 or state.retrieved_graph_path_count > 0
        assert state.insufficient_evidence_flag is False

        # 3. Check Finance Agent finding
        assert state.finance_finding is not None
        assert state.finance_finding.agent_role == AgentRole.FINANCE
        assert len(state.finance_finding.key_analysis) > 10

        # 4. Check Operations Agent finding
        assert state.operations_finding is not None
        assert state.operations_finding.agent_role == AgentRole.OPERATIONS

        # 5. Check Marketing Agent finding
        assert state.marketing_finding is not None
        assert state.marketing_finding.agent_role == AgentRole.MARKETING

        # 6. Check Risk Agent assessment and challenges
        assert state.risk_assessment is not None
        assert state.risk_assessment.agent_role == AgentRole.RISK
        assert len(state.risk_assessment.downside_vulnerability) > 5

        # 7. Check Strategy Supervisor decision
        assert state.supervisor_decision is not None
        assert state.supervisor_decision.final_stance in (
            "APPROVE",
            "REJECT",
            "CONDITIONALLY_APPROVE",
            "DEFER",
        )
        assert len(state.supervisor_decision.executive_summary) > 20
        assert state.total_eval_tokens > 0

        # 8. Check that session was stored in DeliberationRegistry
        retrieved_state = DeliberationRegistry.get(state.session_id)
        assert retrieved_state is not None
        assert retrieved_state.session_id == state.session_id
