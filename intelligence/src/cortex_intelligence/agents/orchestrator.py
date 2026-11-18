from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any
from cortex_intelligence.agents.models import (
    AgentRole,
    DeliberationRequest,
    DeliberationState,
)
from cortex_intelligence.agents.specialists import (
    execute_finance_turn,
    execute_marketing_turn,
    execute_operations_turn,
    execute_risk_turn,
    execute_supervisor_turn,
)
from cortex_intelligence.config import Settings, get_settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.models import GraphRAGRetrieveRequest
from cortex_intelligence.graphrag.service import retrieve_graphrag_evidence
from cortex_intelligence.llm.client import OllamaClient
from cortex_intelligence.models.canonical import utc_now_iso

logger = logging.getLogger("cortex_intelligence.agents.orchestrator")


class DeliberationRegistry:
    """In-memory cache of past multi-agent deliberation states."""

    _store: dict[str, DeliberationState] = {}

    @classmethod
    def save(cls, state: DeliberationState) -> None:
        cls._store[state.session_id] = state
        # Cap history to 50 sessions
        if len(cls._store) > 50:
            oldest_key = next(iter(cls._store))
            cls._store.pop(oldest_key, None)

    @classmethod
    def get(cls, session_id: str) -> DeliberationState | None:
        return cls._store.get(session_id)

    @classmethod
    def list_all(cls, limit: int = 20) -> list[DeliberationState]:
        return list(cls._store.values())[-limit:]


class SequentialDeliberationOrchestrator:
    """Orchestrates turn-by-turn sequential deliberation across the 5 CORTEX agents.
    
    Adheres strictly to the CORTEX Phase 2 specifications:
    - 5 specialized agents execute in sequential order: Finance -> Operations -> Marketing -> Risk -> Strategy Supervisor.
    - Runs sequentially using a single shared DeliberationState, preventing parallel VRAM thrashing on RTX 2050.
    - Feeds verified GraphRAG evidence into agent prompts.
    - Passes prior findings downstream, allowing Risk to challenge assumptions and Supervisor to consolidate.
    - Flags evidence insufficiency and enforces deferred decisions when facts are unverified.
    """

    def __init__(
        self,
        ollama_client: OllamaClient,
        neo4j_client: Neo4jClient,
        settings: Settings | None = None,
    ) -> None:
        self.ollama = ollama_client
        self.neo4j = neo4j_client
        self.settings = settings or get_settings()

    async def run_deliberation(self, request: DeliberationRequest) -> DeliberationState:
        session_id = f"delib-{uuid.uuid4().hex[:12]}"
        logger.info("Initiating 5-agent deliberation session %s for query: %s", session_id, request.query)

        # Step 1: Retrieve GraphRAG evidence
        rag_request = GraphRAGRetrieveRequest(
            query=request.query,
            as_of_date=request.as_of_date,
            include_demonstration=request.include_demonstration,
            temporal_mode=request.temporal_mode,
            top_k=request.top_k,
        )

        try:
            retrieval = retrieve_graphrag_evidence(self.neo4j, rag_request, self.settings)
            chunks_summary = [
                {
                    "chunk_id": c.chunk_id,
                    "document_title": c.document_title,
                    "text_preview": c.text_preview,
                    "data_origin": c.data_origin,
                    "score": c.rrf_score,
                }
                for c in retrieval.chunks
            ]
            paths_summary = [p.summary for p in retrieval.graph_paths]
            insufficient_evidence = len(retrieval.chunks) == 0 and len(retrieval.graph_paths) == 0

            evidence_context: dict[str, Any] = {
                "chunks": chunks_summary,
                "graph_paths": paths_summary,
                "synthetic_scenario": retrieval.origin_evidence.synthetic_scenario,
                "public_historical_dataco": retrieval.origin_evidence.public_historical_dataco,
                "temporal_filter": retrieval.temporal_filter.model_dump(),
            }
        except Exception as exc:
            logger.error("Failed to retrieve GraphRAG evidence for deliberation: %s", exc)
            insufficient_evidence = True
            evidence_context = {"error": str(exc), "chunks": [], "graph_paths": []}

        # Step 2: Initialize Shared Deliberation State
        state = DeliberationState(
            session_id=session_id,
            user_query=request.query,
            as_of_date=request.as_of_date,
            created_at=utc_now_iso(),
            status="IN_PROGRESS",
            graphrag_evidence=evidence_context,
            retrieved_chunk_count=len(evidence_context.get("chunks", [])),
            retrieved_graph_path_count=len(evidence_context.get("graph_paths", [])),
            insufficient_evidence_flag=insufficient_evidence,
        )

        # Step 3: Turn 1 - Finance Agent
        try:
            finding, tokens, lat = await execute_finance_turn(self.ollama, state)
            state.finance_finding = finding
            state.execution_order.append(AgentRole.FINANCE)
            state.agent_latencies_ms["finance"] = lat
            state.total_eval_tokens += tokens
            logger.info("Finance Agent complete (%sms, %s tokens, stance: %s)", lat, tokens, finding.recommendation_stance)
        except Exception as exc:
            logger.error("Finance Agent execution error: %s", exc)
            state.errors.append(f"Finance Agent error: {str(exc)}")

        # Step 4: Turn 2 - Operations Agent
        try:
            finding, tokens, lat = await execute_operations_turn(self.ollama, state)
            state.operations_finding = finding
            state.execution_order.append(AgentRole.OPERATIONS)
            state.agent_latencies_ms["operations"] = lat
            state.total_eval_tokens += tokens
            logger.info("Operations Agent complete (%sms, %s tokens, stance: %s)", lat, tokens, finding.recommendation_stance)
        except Exception as exc:
            logger.error("Operations Agent execution error: %s", exc)
            state.errors.append(f"Operations Agent error: {str(exc)}")

        # Step 5: Turn 3 - Marketing Agent
        try:
            finding, tokens, lat = await execute_marketing_turn(self.ollama, state)
            state.marketing_finding = finding
            state.execution_order.append(AgentRole.MARKETING)
            state.agent_latencies_ms["marketing"] = lat
            state.total_eval_tokens += tokens
            logger.info("Marketing Agent complete (%sms, %s tokens, stance: %s)", lat, tokens, finding.recommendation_stance)
        except Exception as exc:
            logger.error("Marketing Agent execution error: %s", exc)
            state.errors.append(f"Marketing Agent error: {str(exc)}")

        # Step 6: Turn 4 - Risk Agent (Critique & Challenge)
        try:
            risk_assmt, tokens, lat = await execute_risk_turn(self.ollama, state)
            state.risk_assessment = risk_assmt
            state.execution_order.append(AgentRole.RISK)
            state.agent_latencies_ms["risk"] = lat
            state.total_eval_tokens += tokens
            logger.info(
                "Risk Agent complete (%sms, %s tokens, %s challenges, stance: %s)",
                lat,
                tokens,
                len(risk_assmt.challenges_to_previous_findings),
                risk_assmt.recommendation_stance,
            )
        except Exception as exc:
            logger.error("Risk Agent execution error: %s", exc)
            state.errors.append(f"Risk Agent error: {str(exc)}")

        # Step 7: Turn 5 - Strategy Supervisor (Consolidation & Final Decision)
        try:
            decision, tokens, lat = await execute_supervisor_turn(self.ollama, state)
            state.supervisor_decision = decision
            state.execution_order.append(AgentRole.STRATEGY_SUPERVISOR)
            state.agent_latencies_ms["strategy_supervisor"] = lat
            state.total_eval_tokens += tokens
            logger.info(
                "Strategy Supervisor complete (%sms, %s tokens, verdict: %s)",
                lat,
                tokens,
                decision.final_stance,
            )
        except Exception as exc:
            logger.error("Strategy Supervisor execution error: %s", exc)
            state.errors.append(f"Strategy Supervisor error: {str(exc)}")

        state.status = "COMPLETED"
        state.completed_at = utc_now_iso()
        DeliberationRegistry.save(state)
        return state

