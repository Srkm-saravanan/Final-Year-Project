from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from cortex_intelligence.api.dependencies import (
    get_app_settings,
    get_neo4j_client,
    require_service_key,
)
from cortex_intelligence.config import Settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.models import (
    DocumentIngestRequest,
    GraphRAGQueryRequest,
    GraphRAGRetrieveRequest,
)
from cortex_intelligence.graphrag.service import (
    answer_graphrag_question,
    ingest_document_request,
    ingest_uploaded_document_bytes,
    retrieve_graphrag_evidence,
)
from cortex_intelligence.graphrag.vector_store import (
    get_document_with_chunks_in_neo4j,
    list_chunks_in_neo4j,
    list_documents_in_neo4j,
)
from cortex_intelligence.models.canonical import DataOrigin

router = APIRouter(
    prefix="/api/v1/graphrag",
    tags=["GraphRAG"],
    dependencies=[Depends(require_service_key)],
)


def _neo4j_503(exc: Exception) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"Neo4j GraphRAG store unavailable ({type(exc).__name__}).",
    )


@router.post("/documents/ingest", status_code=status.HTTP_201_CREATED)
def ingest_graphrag_document(
    payload: DocumentIngestRequest,
    settings: Settings = Depends(get_app_settings),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    try:
        result = ingest_document_request(neo4j_client, payload, settings=settings)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise _neo4j_503(exc) from exc

    return {
        "success": True,
        "data": result.model_dump(mode="json"),
        "error": None,
    }


@router.post("/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_graphrag_document(
    file: UploadFile = File(...),
    title: str | None = Form(default=None),
    data_origin: DataOrigin = Form(default=DataOrigin.ENTERPRISE_DOCUMENT),
    document_date: str | None = Form(default=None),
    settings: Settings = Depends(get_app_settings),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    raw_bytes = await file.read()
    filename = file.filename or "uploaded_document.txt"
    try:
        result = ingest_uploaded_document_bytes(
            client=neo4j_client,
            raw_bytes=raw_bytes,
            filename=filename,
            title=title,
            data_origin=data_origin,
            document_date=document_date,
            settings=settings,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise _neo4j_503(exc) from exc

    return {
        "success": True,
        "data": result.model_dump(mode="json"),
        "error": None,
    }


@router.get("/documents")
def list_graphrag_documents(
    data_origin: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    try:
        docs = list_documents_in_neo4j(
            neo4j_client,
            data_origin=data_origin,
            limit=limit,
            offset=offset,
        )
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise _neo4j_503(exc) from exc

    return {
        "success": True,
        "data": {
            "count": len(docs),
            "documents": [d.model_dump(mode="json") for d in docs],
        },
        "error": None,
    }


@router.get("/documents/{document_id}")
def inspect_graphrag_document(
    document_id: str,
    limit: int = Query(default=200, ge=1, le=500),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    clean_id = document_id.strip()
    if not clean_id or len(clean_id) > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid document_id.")
    try:
        payload = get_document_with_chunks_in_neo4j(neo4j_client, clean_id, limit=limit)
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise _neo4j_503(exc) from exc

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{clean_id}' not found.",
        )

    return {
        "success": True,
        "data": payload,
        "error": None,
    }


@router.get("/chunks")
def list_graphrag_chunks(
    document_id: str | None = Query(default=None, max_length=200),
    entity_id: str | None = Query(default=None, max_length=200),
    data_origin: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    try:
        chunks = list_chunks_in_neo4j(
            neo4j_client,
            document_id=document_id,
            entity_id=entity_id,
            data_origin=data_origin,
            limit=limit,
            offset=offset,
        )
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise _neo4j_503(exc) from exc

    return {
        "success": True,
        "data": {
            "count": len(chunks),
            "chunks": [c.model_dump(mode="json") for c in chunks],
        },
        "error": None,
    }


@router.post("/retrieve")
def inspect_graphrag_retrieval(
    payload: GraphRAGRetrieveRequest,
    settings: Settings = Depends(get_app_settings),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    try:
        result = retrieve_graphrag_evidence(neo4j_client, payload, settings=settings)
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise _neo4j_503(exc) from exc

    return {
        "success": True,
        "data": result.model_dump(mode="json"),
        "error": None,
    }


@router.post("/query")
def query_graphrag(
    payload: GraphRAGQueryRequest,
    settings: Settings = Depends(get_app_settings),
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> dict[str, object]:
    try:
        answer = answer_graphrag_question(neo4j_client, payload, settings=settings)
    except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
        raise _neo4j_503(exc) from exc

    return {
        "success": True,
        "data": answer.model_dump(mode="json"),
        "error": None,
    }

