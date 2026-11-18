from __future__ import annotations

import math

import pytest

from cortex_intelligence.graphrag.answerer import synthesize_grounded_answer
from cortex_intelligence.graphrag.chunker import chunk_extracted_document
from cortex_intelligence.graphrag.embeddings import (
    LocalSemanticEmbeddingProvider,
    cosine_similarity,
)
from cortex_intelligence.graphrag.entity_linker import link_chunks_to_entities
from cortex_intelligence.graphrag.extractor import (
    build_text_pdf_bytes,
    extract_document_from_bytes,
    extract_document_from_inline_text,
)
from cortex_intelligence.graphrag.models import (
    EntityCatalogEntry,
    GraphRAGQueryRequest,
    GraphRAGRetrievalResult,
    OriginSeparatedEvidence,
    TemporalFilterSummary,
)
from cortex_intelligence.graphrag.retriever import fuse_chunk_candidates_rrf
from cortex_intelligence.graphrag.vector_store import in_memory_hybrid_chunk_search
from cortex_intelligence.models.canonical import DataOrigin


def test_document_extraction_pdf_txt_md_csv_json_and_rejection() -> None:
    # 1. Multi-page PDF extraction with page attribution
    pdf_bytes = build_text_pdf_bytes(
        [
            "Page One: Supplier SYN-SUP-001 experienced 10 days port congestion on PO SYN-PO-0001.",
            "Page Two: Expedite inventory buffer at SYN-WH-001 for dataco:prod:365.",
        ]
    )
    pdf_payload = extract_document_from_bytes(pdf_bytes, filename="risk_brief.pdf")
    assert pdf_payload.doc_type == "pdf"
    assert pdf_payload.page_count == 2
    assert len(pdf_payload.sections) == 2
    assert pdf_payload.sections[0].page_number == 1
    assert "SYN-SUP-001" in pdf_payload.sections[0].text
    assert pdf_payload.sections[1].page_number == 2
    assert "SYN-WH-001" in pdf_payload.sections[1].text

    # 2. Markdown section tracking
    md_bytes = (
        "# Overview\nEffective Date: 2026-10-01.\nSynthetic scenario scope.\n\n"
        "## Mitigation Rules\nReroute shipments when delay >= 10 days."
    ).encode("utf-8")
    md_payload = extract_document_from_bytes(md_bytes, filename="policy.md")
    assert md_payload.doc_type == "md"
    assert md_payload.document_date == "2026-10-01"
    assert len(md_payload.sections) == 2
    assert md_payload.sections[1].section_title == "Mitigation Rules"

    # 3. CSV and JSON linearization
    csv_payload = extract_document_from_bytes(b"code,status\nSYN-PO-0001,DELAYED\n", filename="orders.csv")
    assert "SYN-PO-0001" in csv_payload.full_text
    json_payload = extract_document_from_bytes(b'{"supplier": "SYN-SUP-001"}', filename="meta.json")
    assert "SYN-SUP-001" in json_payload.full_text

    # 4. Unsupported extension & empty input rejections
    with pytest.raises(ValueError, match="Unsupported document format"):
        extract_document_from_bytes(b"MZ...", filename="malware.exe")
    with pytest.raises(ValueError, match="empty"):
        extract_document_from_bytes(b"", filename="empty.txt")


def test_chunking_stable_ids_clean_boundaries_and_provenance() -> None:
    text = (
        "# Executive Supply Brief\n"
        + ("Supplier SYN-SUP-001 ships Perfect Fitness Perfect Rip Deck to USCA-West warehouse SYN-WH-001. " * 12)
        + "\n\n## Warehouse Contingency\n"
        + ("Maintain safety stock buffer across holding warehouses during port congestion events. " * 10)
    )
    payload = extract_document_from_inline_text(
        text=text,
        filename="contingency_plan.md",
        title="Contingency Plan",
        doc_type="md",
        document_id="doc:contingency_plan",
    )
    chunks = chunk_extracted_document(
        payload=payload,
        ingestion_job_id="job-unit-chunk-1",
        data_origin=DataOrigin.ENTERPRISE_DOCUMENT,
        chunk_size=320,
        chunk_overlap=60,
    )
    assert len(chunks) >= 4
    assert all(c.document_entity_id == "doc:contingency_plan" for c in chunks)
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
    assert all(c.chunk_id == f"doc:contingency_plan:chunk:{c.chunk_index}" for c in chunks)
    assert all(c.data_origin == DataOrigin.ENTERPRISE_DOCUMENT for c in chunks)
    assert all(c.ingestion_job_id == "job-unit-chunk-1" for c in chunks)
    assert all(c.source_record_id.startswith("doc:contingency_plan:chunk:") for c in chunks)
    assert all(c.char_end > c.char_start for c in chunks)
    # No empty leading fragments or broken surrogate whitespace
    assert all(len(c.text.strip()) > 0 and c.token_count > 0 for c in chunks)


def test_local_semantic_embeddings_norm_determinism_and_ranking() -> None:
    embedder = LocalSemanticEmbeddingProvider(dimensions=512)
    docs = [
        "Supplier SYN-SUP-001 faces port congestion and carrier delay affecting warehouse inventory shortages.",
        "Acme Manufacturing quarterly demo mock marketing campaign slide presentation.",
    ]
    vecs_a = embedder.embed_texts(docs)
    vecs_b = embedder.embed_texts(docs)
    assert vecs_a == vecs_b
    assert len(vecs_a[0]) == 512
    assert math.isclose(math.sqrt(sum(x * x for x in vecs_a[0])), 1.0, rel_tol=1e-4)

    # Synonym query without exact word "port" or "congestion"
    q_vec = embedder.embed_query("vendor shipping bottleneck stockout risk")
    sim_relevant = cosine_similarity(q_vec, vecs_a[0])
    sim_irrelevant = cosine_similarity(q_vec, vecs_a[1])
    assert sim_relevant > sim_irrelevant + 0.15


def test_entity_linking_confidence_evidence_and_demonstration_isolation() -> None:
    payload = extract_document_from_inline_text(
        text=(
            "Review syn:supplier:SYN-SUP-001 and purchase order SYN-PO-0001 at Synthetic Warehouse USCA-West "
            "and logistics operations overview."
        ),
        filename="ops_note.txt",
        document_id="doc:ops_note",
    )
    chunks = chunk_extracted_document(payload, ingestion_job_id="job-link-1", data_origin=DataOrigin.ENTERPRISE_DOCUMENT)
    catalog = [
        EntityCatalogEntry(
            entity_id="syn:supplier:SYN-SUP-001",
            labels=["Supplier"],
            display_name="Synthetic Vendor 001 (Primary Apparel & Footwear Hub)",
            code="SYN-SUP-001",
            aliases=[],
            data_origin=DataOrigin.SYNTHETIC,
        ),
        EntityCatalogEntry(
            entity_id="syn:po:SYN-PO-0001",
            labels=["PurchaseOrder"],
            display_name="SYN-PO-0001",
            code="SYN-PO-0001",
            aliases=[],
            data_origin=DataOrigin.SYNTHETIC,
        ),
        EntityCatalogEntry(
            entity_id="syn:warehouse:SYN-WH-001",
            labels=["Warehouse"],
            display_name="Synthetic Warehouse USCA-West",
            code="SYN-WH-001",
            aliases=["USCA-West"],
            data_origin=DataOrigin.SYNTHETIC,
        ),
        EntityCatalogEntry(
            entity_id="demo:node:sup-logistics",
            labels=["DemoEntity"],
            display_name="Logistics",
            code="sup-logistics",
            aliases=[],
            data_origin=DataOrigin.DEMONSTRATION,
        ),
    ]
    links = link_chunks_to_entities(chunks, catalog, ingestion_job_id="job-link-1")
    by_id = {lk.target_entity_id: lk for lk in links}

    assert by_id["syn:supplier:SYN-SUP-001"].match_type == "exact_entity_id"
    assert by_id["syn:supplier:SYN-SUP-001"].confidence == 0.99
    assert by_id["syn:po:SYN-PO-0001"].match_type == "exact_code"
    assert by_id["syn:po:SYN-PO-0001"].confidence == 0.95
    assert by_id["syn:warehouse:SYN-WH-001"].match_type == "exact_name"
    assert by_id["syn:warehouse:SYN-WH-001"].confidence == 0.91
    assert "USCA-West" in by_id["syn:warehouse:SYN-WH-001"].evidence_excerpt
    # Enterprise doc must NEVER cross-link into demonstration entities
    assert "demo:node:sup-logistics" not in by_id


def test_in_memory_hybrid_rrf_and_insufficient_evidence_guard() -> None:
    embedder = LocalSemanticEmbeddingProvider(dimensions=512)
    payload = extract_document_from_inline_text(
        text="SYN-SUP-001 delayed purchase order SYN-PO-0004 impacts safety stock shortage.",
        filename="memo.txt",
        document_id="doc:memo",
    )
    chunks = chunk_extracted_document(payload, ingestion_job_id="job-rrf", data_origin=DataOrigin.SYNTHETIC)
    for c, vec in zip(chunks, embedder.embed_texts([c.text for c in chunks])):
        c.embedding = vec

    q = "SYN-SUP-001 delayed PO shortage"
    hits = in_memory_hybrid_chunk_search(
        chunks,
        query_text=q,
        query_vector=embedder.embed_query(q),
        top_k=3,
    )
    assert len(hits) == 1
    assert hits[0]["chunkId"] == "doc:memo:chunk:0"

    # Low-similarity noise without keyword or graph boost must be pruned by RRF gate
    fused_noise = fuse_chunk_candidates_rrf(
        vector_rows=[
            {
                "entityId": "doc:noise:chunk:0",
                "chunkId": "doc:noise:chunk:0",
                "documentEntityId": "doc:noise",
                "dataOrigin": "enterprise_document",
                "text": "Unrelated text",
                "score": 0.56,
                "linkedEntities": [],
            }
        ],
        keyword_rows=[],
        graph_mention_rows=[],
        anchor_entity_ids=set(),
        top_k=5,
    )
    assert fused_noise == []

    # Insufficient evidence answer must not fabricate citations
    req = GraphRAGQueryRequest(query="nonexistent mars ice cream shipments")
    empty_ret = GraphRAGRetrievalResult(
        query=req.query,
        retrieval_channels_used=[],
        matched_entities=[],
        chunks=[],
        graph_paths=[],
        temporal_filter=TemporalFilterSummary(
            mode="scenario_aware",
            as_of_date="2026-11-12",
            explanation="No matching records.",
        ),
        origin_evidence=OriginSeparatedEvidence(),
    )
    ans = synthesize_grounded_answer(req, empty_ret)
    assert ans.insufficient_evidence is True
    assert ans.grounded_claims_count == 0
    assert ans.citations == []

