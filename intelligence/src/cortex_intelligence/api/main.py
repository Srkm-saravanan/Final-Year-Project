from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from cortex_intelligence.api.routes import agents, graph, graphrag, health, ingestion, llm, predictive
from cortex_intelligence.config import Settings, ensure_directories, get_settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.llm.client import OllamaClient


def create_app(
    settings_override: Settings | None = None,
    neo4j_client_override: Neo4jClient | None = None,
    ollama_client_override: OllamaClient | None = None,
) -> FastAPI:
    cfg = settings_override or get_settings()
    ensure_directories(cfg)
    neo4j_client = neo4j_client_override or Neo4jClient(cfg)
    ollama_client = ollama_client_override or OllamaClient(cfg)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        yield
        if neo4j_client_override is None:
            neo4j_client.close()
        if ollama_client_override is None:
            await ollama_client.close()

    app = FastAPI(
        title="CORTEX Intelligence Service",
        description="Phase D1 Enterprise Data Ingestion & Neo4j Knowledge Graph API",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.state.settings = cfg
    app.state.neo4j_client = neo4j_client
    app.state.ollama_client = ollama_client

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_req: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": f"HTTP_{exc.status_code}",
                    "message": str(exc.detail),
                },
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_req: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Request validation failed.",
                    "details": exc.errors(),
                },
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_req: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "data": None,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": f"Unexpected internal error ({type(exc).__name__}).",
                },
            },
        )

    app.include_router(health.router)
    app.include_router(ingestion.router)
    app.include_router(graph.router)
    app.include_router(graphrag.router)
    app.include_router(llm.router)
    app.include_router(agents.router)
    app.include_router(predictive.router)
    return app


app = create_app()

