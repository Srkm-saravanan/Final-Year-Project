from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from cortex_intelligence.api.dependencies import get_neo4j_client, require_service_key
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graph.queries import (
    get_entity_by_id,
    get_entity_relationships,
    get_graph_statistics,
)

router = APIRouter(
    prefix="/api/v1/graph",
    tags=["KnowledgeGraph"],
    dependencies=[Depends(require_service_key)],
)


@router.get("/statistics")
def read_graph_statistics(
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    try:
        stats = get_graph_statistics(neo4j_client)
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Neo4j graph database unavailable ({type(exc).__name__}).",
        ) from exc

    return {
        "success": True,
        "data": stats,
        "error": None,
    }


@router.get("/entities/{entity_id}")
def read_graph_entity(
    entity_id: str,
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    if not entity_id.strip() or len(entity_id) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid entity_id.",
        )
    try:
        entity = get_entity_by_id(neo4j_client, entity_id.strip())
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Neo4j graph database unavailable ({type(exc).__name__}).",
        ) from exc

    if entity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entity '{entity_id}' not found in knowledge graph.",
        )

    return {
        "success": True,
        "data": entity,
        "error": None,
    }


@router.get("/relationships/{entity_id}")
def read_graph_entity_relationships(
    entity_id: str,
    limit: int = Query(default=50, ge=1, le=200),
    direction: Literal["both", "outgoing", "incoming"] = Query(default="both"),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    if not entity_id.strip() or len(entity_id) > 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid entity_id.",
        )
    try:
        rel_data = get_entity_relationships(
            neo4j_client,
            entity_id.strip(),
            limit=limit,
            direction=direction,
        )
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Neo4j graph database unavailable ({type(exc).__name__}).",
        ) from exc

    if rel_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entity '{entity_id}' not found in knowledge graph.",
        )

    return {
        "success": True,
        "data": rel_data,
        "error": None,
    }

