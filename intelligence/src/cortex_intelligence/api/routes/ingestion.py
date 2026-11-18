from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from cortex_intelligence.acquisition.registry import load_registry
from cortex_intelligence.api.dependencies import (
    get_app_settings,
    get_neo4j_client,
    require_service_key,
)
from cortex_intelligence.config import Settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.pipeline.runner import load_job_record, run_ingestion_pipeline

router = APIRouter(
    prefix="/api/v1/ingestion",
    tags=["Ingestion"],
    dependencies=[Depends(require_service_key)],
)


class StructuredIngestionRequest(BaseModel):
    mode: Literal["full", "sample"] = "sample"
    source_csv: str | None = Field(default=None, max_length=300)
    skip_neo4j: bool = False
    include_demonstration: bool = True
    include_synthetic: bool = True
    batch_size: int = Field(default=5000, ge=100, le=20000)


def _resolve_safe_csv(settings: Settings, rel_or_name: str | None) -> Path | None:
    if not rel_or_name:
        return None
    candidate = (settings.data_dir / rel_or_name).resolve()
    allowed_root = settings.data_dir.resolve()
    try:
        candidate.relative_to(allowed_root)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source_csv must reside inside the configured data directory.",
        ) from exc
    if not candidate.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CSV source not found: {rel_or_name}",
        )
    return candidate


@router.post("/structured", status_code=status.HTTP_201_CREATED)
def trigger_structured_ingestion(
    payload: StructuredIngestionRequest,
    settings: Settings = Depends(get_app_settings),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    resolved_csv = _resolve_safe_csv(settings, payload.source_csv)
    try:
        job = run_ingestion_pipeline(
            settings=settings,
            mode=payload.mode,
            source_csv=resolved_csv,
            skip_neo4j=payload.skip_neo4j,
            include_demonstration=payload.include_demonstration,
            include_synthetic=payload.include_synthetic,
            neo4j_client=neo4j_client,
            batch_size=payload.batch_size,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return {
        "success": True,
        "data": job.model_dump(mode="json"),
        "error": None,
    }


@router.get("/jobs/{job_id}")
def get_ingestion_job(
    job_id: str,
    settings: Settings = Depends(get_app_settings),
) -> dict[str, object]:
    job = load_job_record(job_id, settings=settings)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ingestion job '{job_id}' was not found.",
        )
    return {
        "success": True,
        "data": job.model_dump(mode="json"),
        "error": None,
    }


@router.get("/sources")
def list_ingestion_sources(
    settings: Settings = Depends(get_app_settings),
) -> dict[str, object]:
    entries = load_registry(settings=settings)
    return {
        "success": True,
        "data": {
            "count": len(entries),
            "sources": [entry.model_dump(mode="json") for entry in entries],
        },
        "error": None,
    }

