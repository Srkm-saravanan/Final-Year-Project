from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from cortex_intelligence.api.main import create_app
from cortex_intelligence.config import Settings, get_settings
from cortex_intelligence.graph.ingestor import validate_graph_integrity
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.extractor import build_text_pdf_bytes
from cortex_intelligence.graphrag.models import (
    DocumentIngestRequest,
    GraphRAGQueryRequest,
    GraphRAGRetrieveRequest,
)
from cortex_intelligence.graphrag.service import (
    answer_graphrag_question,
    bootstrap_default_documents,
    ingest_document_request,
    retrieve_graphrag_evidence,
)
from cortex_intelligence.models.canonical import DataOrigin


def _get_live_client_or_skip() -> tuple[Settings, Neo4jClient]:
    settings = get_settings()
    client = Neo4jClient(settings)
    if not client.verify_connectivity().get("connected"):
        client.close()
        pytest.skip("Live Neo4j graph unavailable.")
    return settings, client


def test_graphrag_live_ingestion_hybrid_retrieval_multihop_temporal_and_grounding() -> None:
    settings, client = _get_live_client_or_skip()
    created_doc_ids = ["doc:pytest_supplier_note.txt", "doc:pytest_upload_brief.pdf"]

    try:
        # Ensure curated Phase D2 docs exist in Neo4j cleanly
        bootstrap_default_documents(client, settings=settings)

        # 1. Test document ingestion & idempotent update/shrinkage cleanup
        first = ingest_document_request(
            client,
            DocumentIngestRequest(
                text=(
                    "# Pytest Section 1\n"
                    + ("SYN-SUP-001 delays impact Perfect Fitness Perfect Rip Deck (dataco:prod:365) at SYN-WH-001. " * 8)
                    + "\n\n# Pytest Section 2\n"
                    + ("Additional contingency planning notes for SYN-WH-003. " * 6)
                ),
                filename="pytest_supplier_note.txt",
                title="Pytest Supplier Note",
                document_id="doc:pytest_supplier_note.txt",
                data_origin=DataOrigin.ENTERPRISE_DOCUMENT,
                chunk_size=260,
                chunk_overlap=40,
            ),
            settings=settings,
        )
        assert first.chunks_indexed >= 2
        assert first.entity_links_created >= 2

        second = ingest_document_request(
            client,
            DocumentIngestRequest(
                text="Short updated note for syn:supplier:SYN-SUP-001 and SYN-WH-001.",
                filename="pytest_supplier_note.txt",
                title="Pytest Supplier Note",
                document_id="doc:pytest_supplier_note.txt",
                data_origin=DataOrigin.ENTERPRISE_DOCUMENT,
                chunk_size=260,
                chunk_overlap=40,
            ),
            settings=settings,
        )
        assert second.chunks_indexed == 1

        # 2. Example Business Question: Hybrid Retrieval, Multi-Hop, Citations, Temporal Filter, Origin Separation
        biz_q = (
            "If supplier SYN-SUP-001 experiences a delay, which products, warehouses and orders "
            "could be exposed? Explain the evidence."
        )
        ans = answer_graphrag_question(
            client,
            GraphRAGQueryRequest(query=biz_q, top_k=6, temporal_mode="scenario_aware", as_of_date="2026-11-12"),
            settings=settings,
        )
        assert ans.insufficient_evidence is False
        assert ans.grounded_claims_count >= 5
        assert len(ans.citations) >= 2
        assert len(ans.graph_paths) >= 4

        # Verify every document citation maps cleanly to retrieved chunks
        doc_cits = [c for c in ans.citations if c.source_type == "document_chunk"]
        path_cits = [c for c in ans.citations if c.source_type == "neo4j_graph_path"]
        assert len(doc_cits) >= 1
        assert len(path_cits) >= 1
        retrieved_chunk_ids = {ch.chunk_id for ch in (ans.retrieval.chunks if ans.retrieval else [])}
        for cit in doc_cits:
            assert cit.chunk_id in retrieved_chunk_ids
            assert f"[{cit.citation_id}]" in ans.answer_markdown

        # Multi-hop accuracy & origin separation assertions
        syn = ans.origin_evidence.synthetic_scenario
        hist = ans.origin_evidence.public_historical_dataco
        assert syn["supplier"]["entityId"] == "syn:supplier:SYN-SUP-001"
        assert syn["delayed_purchase_orders_count"] == 15
        assert len(syn["delayed_po_destination_warehouses"]) == 4
        assert syn["holding_warehouses_count"] == 8
        assert syn["directly_affected_shortage_inventory_count"] == 12
        assert syn["network_shortage_inventory_count"] == 24
        assert syn["supplied_products_count"] == 12

        # Temporal filter correctness: 0 current real-world orders, 56,345 excluded pre-scenario historical orders
        assert ans.temporal_filter.current_real_world_orders_count == 0
        assert ans.temporal_filter.overlapping_window_orders_count == 0
        assert ans.temporal_filter.historical_orders_excluded_from_active_count == 56345
        assert hist["historical_all_years_orders_total"] == 56345
        assert "never causally damaged" in hist["causal_note"].lower()
        assert ans.origin_evidence.demonstration["included"] is False
        assert ans.origin_evidence.demonstration["chunk_count"] == 0

        # Strict-active mode zeroes historical demand exposure count
        strict_ret = retrieve_graphrag_evidence(
            client,
            GraphRAGRetrieveRequest(
                query=biz_q,
                top_k=4,
                temporal_mode="strict_active",
                as_of_date="2026-11-12",
            ),
            settings=settings,
        )
        assert strict_ret.origin_evidence.public_historical_dataco["historical_all_years_demand_orders_count"] == 0

        # Jan-2018 overlap verification on SYN-SUP-018
        jan_ret = retrieve_graphrag_evidence(
            client,
            GraphRAGRetrieveRequest(
                query="Analyze delayed procurement impact for supplier SYN-SUP-018.",
                top_k=3,
                temporal_mode="scenario_aware",
                as_of_date="2026-11-12",
            ),
            settings=settings,
        )
        assert jan_ret.temporal_filter.overlapping_window_orders_count > 0
        assert jan_ret.temporal_filter.current_real_world_orders_count == 0

        # Out-of-scope query must not hallucinate
        nosuch = answer_graphrag_question(
            client,
            GraphRAGQueryRequest(query="quantum pineapple submarine recipe on Mars", top_k=5),
            settings=settings,
        )
        assert nosuch.insufficient_evidence is True
        assert nosuch.citations == []

        # 3. FastAPI GraphRAG HTTP endpoints check (real TestClient + live Neo4j)
        app = create_app(settings_override=settings, neo4j_client_override=client)
        headers = {"X-Cortex-Service-Key": settings.intelligence_api_key} if settings.intelligence_api_key else {}

        with TestClient(app) as http:
            # Unauthorized guard if key is configured
            if settings.intelligence_api_key:
                assert http.get("/api/v1/graphrag/documents").status_code == 401

            # Multipart PDF upload endpoint
            pdf_bytes = build_text_pdf_bytes(
                ["Upload test: syn:supplier:SYN-SUP-001 safety stock check at syn:warehouse:SYN-WH-001."]
            )
            up_resp = http.post(
                "/api/v1/graphrag/documents/upload",
                headers=headers,
                files={"file": ("pytest_upload_brief.pdf", pdf_bytes, "application/pdf")},
                data={"title": "Pytest Upload PDF", "data_origin": "enterprise_document"},
            )
            assert up_resp.status_code == 201
            up_data = up_resp.json()["data"]
            assert up_data["document"]["entity_id"] == "doc:pytest_upload_brief.pdf"
            assert up_data["chunks_indexed"] == 1
            assert up_data["entity_links_created"] >= 2

            docs_resp = http.get("/api/v1/graphrag/documents", headers=headers)
            assert docs_resp.status_code == 200
            doc_ids = {d["entity_id"] for d in docs_resp.json()["data"]["documents"]}
            assert "doc:CORTEX_Synthetic_Procurement_Brief.pdf" in doc_ids
            assert "doc:pytest_upload_brief.pdf" in doc_ids

            one_doc = http.get("/api/v1/graphrag/documents/doc:CORTEX_Synthetic_Procurement_Brief.pdf", headers=headers)
            assert one_doc.status_code == 200
            assert len(one_doc.json()["data"]["chunks"]) >= 2

            chunks_resp = http.get(
                "/api/v1/graphrag/chunks?entity_id=syn:supplier:SYN-SUP-001",
                headers=headers,
            )
            assert chunks_resp.status_code == 200
            assert chunks_resp.json()["data"]["count"] >= 3

            ret_resp = http.post(
                "/api/v1/graphrag/retrieve",
                headers=headers,
                json={"query": biz_q, "top_k": 4},
            )
            assert ret_resp.status_code == 200
            assert len(ret_resp.json()["data"]["graph_paths"]) >= 1

            q_resp = http.post(
                "/api/v1/graphrag/query",
                headers=headers,
                json={"query": biz_q, "top_k": 4},
            )
            assert q_resp.status_code == 200
            q_data = q_resp.json()["data"]
            assert q_data["insufficient_evidence"] is False
            assert len(q_data["citations"]) >= 2

            assert http.get("/api/v1/graphrag/documents/doc:missing_nonexistent").status_code in (401, 404)

        # Verify Phase D1 + D2 full graph provenance integrity passes completely
        integrity = validate_graph_integrity(client)
        assert integrity["integrity_passed"] is True
        assert integrity["missing_provenance_nodes"] == 0
        assert integrity["missing_provenance_relationships"] == 0
        assert integrity["duplicate_entity_ids"] == 0
    finally:
        with client.session() as sess:
            sess.run(
                """
                MATCH (d:Document)
                WHERE d.entityId IN $ids
                OPTIONAL MATCH (d)-[:CONTAINS_CHUNK]->(c:DocumentChunk)
                DETACH DELETE c, d
                """,
                ids=created_doc_ids,
            ).consume()
        client.close()

