from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from cortex_intelligence.config import Settings, ensure_directories, get_settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.answerer import synthesize_grounded_answer
from cortex_intelligence.graphrag.chunker import chunk_extracted_document
from cortex_intelligence.graphrag.embeddings import EmbeddingProvider, build_embedding_provider
from cortex_intelligence.graphrag.entity_linker import (
    link_chunks_to_entities,
    load_entity_catalog_from_neo4j,
)
from cortex_intelligence.graphrag.extractor import (
    extract_document_from_bytes,
    extract_document_from_file,
    extract_document_from_inline_text,
)
from cortex_intelligence.graphrag.models import (
    DocumentIngestRequest,
    DocumentIngestResult,
    DocumentSummary,
    ExtractedDocumentPayload,
    GraphRAGAnswerResponse,
    GraphRAGQueryRequest,
    GraphRAGRetrievalResult,
    GraphRAGRetrieveRequest,
)
from cortex_intelligence.graphrag.retriever import run_hybrid_retrieval
from cortex_intelligence.graphrag.vector_store import (
    ensure_graphrag_schema,
    list_documents_in_neo4j,
    upsert_document_to_neo4j,
)
from cortex_intelligence.models.canonical import DataOrigin, utc_now_iso


def _new_graphrag_job_id() -> str:
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return f"graphrag-{stamp}-{uuid.uuid4().hex[:8]}"


def _process_extracted_payload(
    client: Neo4jClient,
    payload: ExtractedDocumentPayload,
    data_origin: DataOrigin,
    settings: Settings,
    embedding_provider: EmbeddingProvider | None = None,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> DocumentIngestResult:
    ensure_directories(settings)
    job_id = _new_graphrag_job_id()
    embedder = embedding_provider or build_embedding_provider(
        provider_name=settings.graphrag_embedding_provider,
        dimensions=settings.graphrag_embedding_dimensions,
        model_name=settings.graphrag_embedding_model,
        gemini_api_key=settings.gemini_api_key,
    )

    chunks = chunk_extracted_document(
        payload=payload,
        ingestion_job_id=job_id,
        data_origin=data_origin,
        chunk_size=chunk_size or settings.graphrag_chunk_size,
        chunk_overlap=chunk_overlap if chunk_overlap is not None else settings.graphrag_chunk_overlap,
        embedding_model=embedder.model_name,
        embedding_dimensions=embedder.dimensions,
    )
    vectors = embedder.embed_texts([c.text for c in chunks])
    for chunk, vec in zip(chunks, vectors):
        chunk.embedding = vec

    ensure_graphrag_schema(client, embedding_dimensions=embedder.dimensions)
    catalog = load_entity_catalog_from_neo4j(client)
    links = link_chunks_to_entities(
        chunks=chunks,
        catalog=catalog,
        ingestion_job_id=job_id,
        neo4j_client=client,
    )

    updated_at = utc_now_iso()
    upsert_document_to_neo4j(
        client=client,
        payload=payload,
        chunks=chunks,
        links=links,
        data_origin=data_origin,
        ingestion_job_id=job_id,
        updated_at=updated_at,
    )

    linked_entity_ids = {lk.target_entity_id for lk in links}
    doc_summary = DocumentSummary(
        entity_id=payload.document_entity_id,
        title=payload.title,
        doc_type=payload.doc_type,
        source_path=payload.source_path,
        sha256=payload.sha256,
        chunk_count=len(chunks),
        linked_entity_count=len(linked_entity_ids),
        page_count=payload.page_count,
        document_date=payload.document_date,
        embedding_model=embedder.model_name,
        data_origin=data_origin.value,
        source_dataset=payload.filename,
        ingestion_job_id=job_id,
        updated_at=updated_at,
    )
    return DocumentIngestResult(
        job_id=job_id,
        document=doc_summary,
        chunks_indexed=len(chunks),
        entity_links_created=len(links),
        embedding_model=embedder.model_name,
        embedding_dimensions=embedder.dimensions,
        sample_entity_links=links[:10],
    )


def resolve_safe_document_path(raw_path: str, settings: Settings) -> Path:
    candidate_raw = Path(raw_path)
    allowed_roots = [
        settings.data_dir.resolve(),
        settings.documents_dir.resolve(),
    ]
    # Also permit explicitly allowlisted project-root markdown docs from Phase D1
    allowlisted_files = {
        (settings.project_root / "README.md").resolve(),
        (settings.project_root / "UG_PROJECT_FIRST_REVIEW_PRESENTATION.md").resolve(),
    }

    if candidate_raw.is_absolute():
        resolved = candidate_raw.resolve()
    else:
        in_docs = (settings.documents_dir / raw_path).resolve()
        in_data = (settings.data_dir / raw_path).resolve()
        in_root = (settings.project_root / raw_path).resolve()
        if in_docs.exists():
            resolved = in_docs
        elif in_data.exists():
            resolved = in_data
        else:
            resolved = in_root

    in_allowed_dir = any(
        resolved == root or resolved.is_relative_to(root)
        for root in allowed_roots
    )
    if not in_allowed_dir and resolved not in allowlisted_files:
        raise ValueError(
            "file_path must reside inside the configured data/ or data/documents/ directory."
        )
    if not resolved.exists() or not resolved.is_file():
        raise FileNotFoundError(f"Document file not found: {raw_path}")
    return resolved


def ingest_document_request(
    client: Neo4jClient,
    request: DocumentIngestRequest,
    settings: Settings | None = None,
    embedding_provider: EmbeddingProvider | None = None,
) -> DocumentIngestResult:
    cfg = settings or get_settings()
    if request.file_path:
        path = resolve_safe_document_path(request.file_path, cfg)
        payload = extract_document_from_file(
            path=path,
            title=request.title,
            doc_type=request.doc_type,
            document_id=request.document_id,
            source_path=path.name,
            document_date=request.document_date,
        )
    elif request.text:
        payload = extract_document_from_inline_text(
            text=request.text,
            filename=request.filename or "inline_document.txt",
            title=request.title,
            doc_type=request.doc_type or "txt",
            document_id=request.document_id,
            document_date=request.document_date,
        )
    else:
        raise ValueError("Either 'file_path' or 'text' must be provided for document ingestion.")

    return _process_extracted_payload(
        client=client,
        payload=payload,
        data_origin=request.data_origin,
        settings=cfg,
        embedding_provider=embedding_provider,
        chunk_size=request.chunk_size,
        chunk_overlap=request.chunk_overlap,
    )


def ingest_uploaded_document_bytes(
    client: Neo4jClient,
    raw_bytes: bytes,
    filename: str,
    title: str | None = None,
    data_origin: DataOrigin = DataOrigin.ENTERPRISE_DOCUMENT,
    document_date: str | None = None,
    settings: Settings | None = None,
    embedding_provider: EmbeddingProvider | None = None,
) -> DocumentIngestResult:
    cfg = settings or get_settings()
    ensure_directories(cfg)
    payload = extract_document_from_bytes(
        raw_bytes=raw_bytes,
        filename=Path(filename).name,
        title=title,
        document_date=document_date,
    )
    return _process_extracted_payload(
        client=client,
        payload=payload,
        data_origin=data_origin,
        settings=cfg,
        embedding_provider=embedding_provider,
    )


def bootstrap_default_documents(
    client: Neo4jClient,
    settings: Settings | None = None,
) -> list[DocumentIngestResult]:
    """Ingest curated enterprise/synthetic documents in data/documents/ plus Phase D1 demonstration markdown docs."""
    cfg = settings or get_settings()
    targets: list[tuple[Path, str, DataOrigin, str | None]] = [
        (
            cfg.documents_dir / "CORTEX_Supplier_Delay_SOP.txt",
            "CORTEX Supplier Delay Response SOP & Mitigation Policy",
            DataOrigin.ENTERPRISE_DOCUMENT,
            "2026-10-15",
        ),
        (
            cfg.documents_dir / "CORTEX_DataCo_Baseline_and_Temporal_Governance.md",
            "DataCo Historical Baseline & Temporal Filtering Governance",
            DataOrigin.ENTERPRISE_DOCUMENT,
            "2026-11-01",
        ),
        (
            cfg.documents_dir / "CORTEX_Synthetic_Procurement_Brief.pdf",
            "Synthetic Procurement Delay Risk Brief (SYN-SUP-001 Scenario)",
            DataOrigin.SYNTHETIC,
            "2018-01-30",
        ),
        (
            cfg.project_root / "UG_PROJECT_FIRST_REVIEW_PRESENTATION.md",
            "UG Project Review Deck",
            DataOrigin.DEMONSTRATION,
            None,
        ),
        (
            cfg.project_root / "README.md",
            "CORTEX Project README",
            DataOrigin.DEMONSTRATION,
            None,
        ),
    ]
    results: list[DocumentIngestResult] = []
    for path, title, origin, doc_date in targets:
        if not path.exists():
            continue
        payload = extract_document_from_file(
            path=path,
            title=title,
            source_path=path.name,
            document_date=doc_date,
        )
        results.append(
            _process_extracted_payload(
                client=client,
                payload=payload,
                data_origin=origin,
                settings=cfg,
            )
        )
    return results


def retrieve_graphrag_evidence(
    client: Neo4jClient,
    request: GraphRAGRetrieveRequest,
    settings: Settings | None = None,
) -> GraphRAGRetrievalResult:
    cfg = settings or get_settings()
    return run_hybrid_retrieval(client=client, request=request, settings=cfg)


def answer_graphrag_question(
    client: Neo4jClient,
    request: GraphRAGQueryRequest,
    settings: Settings | None = None,
) -> GraphRAGAnswerResponse:
    cfg = settings or get_settings()
    retrieval = run_hybrid_retrieval(client=client, request=request, settings=cfg)
    return synthesize_grounded_answer(request=request, retrieval=retrieval)


def get_graphrag_status_summary(client: Neo4jClient) -> dict[str, object]:
    docs = list_documents_in_neo4j(client, limit=200)
    return {
        "documents_count": len(docs),
        "total_chunks": sum(d.chunk_count for d in docs),
        "documents_by_origin": {
            origin: sum(1 for d in docs if d.data_origin == origin)
            for origin in sorted({d.data_origin for d in docs})
        },
    }

