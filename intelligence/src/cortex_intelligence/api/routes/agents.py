from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status

from cortex_intelligence.agents.models import (
    DeliberationRequest,
    DeliberationState,
)
from cortex_intelligence.agents.orchestrator import (
    DeliberationRegistry,
    SequentialDeliberationOrchestrator,
)
from cortex_intelligence.api.dependencies import (
    get_app_settings,
    get_neo4j_client,
    get_ollama_client,
    require_service_key,
)
from cortex_intelligence.config import Settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.llm.client import OllamaClient

router = APIRouter(
    prefix="/api/v1/agents",
    tags=["Multi-Agent Orchestration"],
    dependencies=[Depends(require_service_key)],
)


@router.get("/manifest", response_model=dict[str, Any])
def get_agents_manifest() -> dict[str, Any]:
    """Retrieve metadata and roles of the 5 active CORTEX decision agents."""
    return {
        "success": True,
        "data": {
            "orchestration_mode": "sequential_state_graph",
            "execution_order": [
                "finance",
                "operations",
                "marketing",
                "risk",
                "strategy_supervisor",
            ],
            "concurrency_limit": 1,
            "agents": [
                {
                    "role": "finance",
                    "name": "Finance Agent",
                    "focus": "Financial Analysis, Margin Optimization & Capital Allocation",
                    "icon": "BadgePercent",
                },
                {
                    "role": "operations",
                    "name": "Operations Agent",
                    "focus": "Supply Chain Logistics, Warehouse Inventory & PO Delays",
                    "icon": "Boxes",
                },
                {
                    "role": "marketing",
                    "name": "Marketing Agent",
                    "focus": "Customer Demand, Regional Sales Velocity & SLA Risk",
                    "icon": "TrendingUp",
                },
                {
                    "role": "risk",
                    "name": "Risk Agent",
                    "focus": "Downside Vulnerability, Single-Source Risk & Assumption Auditing",
                    "icon": "ShieldAlert",
                },
                {
                    "role": "strategy_supervisor",
                    "name": "Strategy Supervisor",
                    "focus": "Consensus Synthesis, Trade-off Resolution & Executive Verdict",
                    "icon": "Briefcase",
                },
            ],
        },
        "error": None,
    }


@router.post("/deliberate", response_model=dict[str, Any], status_code=status.HTTP_200_OK)
async def start_deliberation(
    payload: DeliberationRequest,
    settings: Settings = Depends(get_app_settings),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
    ollama_client: OllamaClient = Depends(get_ollama_client),
) -> dict[str, Any]:
    """Execute turn-by-turn multi-agent deliberation grounded in GraphRAG evidence."""
    orchestrator = SequentialDeliberationOrchestrator(
        ollama_client=ollama_client,
        neo4j_client=neo4j_client,
        settings=settings,
    )

    try:
        state: DeliberationState = await orchestrator.run_deliberation(payload)
        return {
            "success": True,
            "data": state.model_dump(),
            "error": None,
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deliberation failed: {str(exc)}",
        ) from exc


@router.get("/deliberations/{session_id}", response_model=dict[str, Any])
def get_deliberation(
    session_id: str,
) -> dict[str, Any]:
    """Retrieve an existing deliberation session by ID."""
    state = DeliberationRegistry.get(session_id)
    if not state:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Deliberation session '{session_id}' not found.",
        )

    return {
        "success": True,
        "data": state.model_dump(),
        "error": None,
    }

