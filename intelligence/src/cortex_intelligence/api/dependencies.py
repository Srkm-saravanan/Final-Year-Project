from __future__ import annotations

import hmac
from fastapi import Depends, Header, HTTPException, Request, status

from cortex_intelligence.config import Settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.llm.client import OllamaClient


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings  # type: ignore[no-any-return]


def get_neo4j_client(request: Request) -> Neo4jClient:
    return request.app.state.neo4j_client  # type: ignore[no-any-return]


def get_ollama_client(request: Request) -> OllamaClient:
    return request.app.state.ollama_client  # type: ignore[no-any-return]


def require_service_key(
    settings: Settings = Depends(get_app_settings),
    x_cortex_service_key: str | None = Header(default=None, alias="X-Cortex-Service-Key"),
) -> None:
    expected = settings.intelligence_api_key.strip()
    if not expected:
        return
    if not x_cortex_service_key or not hmac.compare_digest(x_cortex_service_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid internal service authentication key.",
        )

