from __future__ import annotations

from fastapi import APIRouter, Depends

from cortex_intelligence.api.dependencies import get_app_settings, get_neo4j_client
from cortex_intelligence.config import Settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.models import utc_now_iso

router = APIRouter()


@router.get("/health", tags=["Health"])
def health_check(
    settings: Settings = Depends(get_app_settings),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    neo4j_status = neo4j_client.verify_connectivity()
    overall = "ok" if neo4j_status.get("connected") else "degraded"
    return {
        "success": True,
        "data": {
            "service": "cortex-intelligence-service",
            "status": overall,
            "timestamp": utc_now_iso(),
            "neo4j": neo4j_status,
            "synthetic_seed": settings.synthetic_random_seed,
        },
        "error": None,
    }

