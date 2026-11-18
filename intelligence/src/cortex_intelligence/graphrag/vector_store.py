from __future__ import annotations

import re
from typing import Any

from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.embeddings import cosine_similarity
from cortex_intelligence.graphrag.models import (
    ChunkInspectionRecord,
    ChunkRecord,
    DocumentSummary,
    EntityLinkRecord,
    ExtractedDocumentPayload,
)
from cortex_intelligence.models.canonical import DataOrigin

_LUCENE_SPECIAL_RE = re.compile(r'([+\-&|!(){}\[\]^"~*?:\\/])')


def escape_lucene_query(raw_query: str) -> str:
    tokens = [tok.strip() for tok in re.split(r"\s+", raw_query.strip()) if tok.strip()]
    safe_terms: list[str] = []
    for tok in tokens:
        cleaned = _LUCENE_SPECIAL_RE.sub(r"\\\1", tok)
        if cleaned and cleaned.upper() not in {"AND", "OR", "NOT"}:
            safe_terms.append(cleaned)
    return " OR ".join(safe_terms[:24]) if safe_terms else "cortex"


def ensure_graphrag_schema(
    client: Neo4jClient,
    embedding_dimensions: int = 512,
) -> None:
    """Create Neo4j constraints, property indexes, 512-dim vector index, and fulltext indexes idempotently."""
    client.ensure_schema()
    statements = [
        "CREATE CONSTRAINT cortex_document_entity_id_unique IF NOT EXISTS FOR (n:Document) REQUIRE n.entityId IS UNIQUE",
        "CREATE CONSTRAINT cortex_documentchunk_entity_id_unique IF NOT EXISTS FOR (n:DocumentChunk) REQUIRE n.entityId IS UNIQUE",
        "CREATE INDEX cortex_chunk_doc_id_idx IF NOT EXISTS FOR (c:DocumentChunk) ON (c.documentEntityId)",
        "CREATE INDEX cortex_chunk_origin_idx IF NOT EXISTS FOR (c:DocumentChunk) ON (c.dataOrigin)",
        "CREATE INDEX cortex_chunk_date_idx IF NOT EXISTS FOR (c:DocumentChunk) ON (c.documentDate)",
        (
            "CREATE VECTOR INDEX cortex_chunk_embedding_idx IF NOT EXISTS "
            "FOR (c:DocumentChunk) ON (c.embedding) "
            f"OPTIONS {{indexConfig: {{`vector.dimensions`: {int(embedding_dimensions)}, "
            "`vector.similarity_function`: 'cosine'}}"
        ),
        (
            "CREATE FULLTEXT INDEX cortex_chunk_fulltext_idx IF NOT EXISTS "
            "FOR (c:DocumentChunk) ON EACH [c.text, c.sectionTitle, c.documentTitle]"
        ),
        (
            "CREATE FULLTEXT INDEX cortex_entity_fulltext_idx IF NOT EXISTS "
            "FOR (n:Supplier|Product|Warehouse|PurchaseOrder|Inventory|ProductCategory|Department|Region|DemoEntity) "
            "ON EACH [n.entityId, n.name, n.label, n.title, n.supplierCode, n.warehouseCode, n.poCode, n.productCode, n.delayCause, n.tier, n.market, n.regionName, n.description]"
        ),
    ]
    with client.session() as sess:
        for stmt in statements:
            sess.run(stmt).consume()
        sess.run("CALL db.awaitIndexes(30)").consume()


def upsert_document_to_neo4j(
    client: Neo4jClient,
    payload: ExtractedDocumentPayload,
    chunks: list[ChunkRecord],
    links: list[EntityLinkRecord],
    data_origin: DataOrigin,
    ingestion_job_id: str,
    updated_at: str,
) -> dict[str, int]:
    """Idempotently store Document, DocumentChunk embeddings, CONTAINS_CHUNK, and MENTIONS links in Neo4j."""
    ensure_graphrag_schema(
        client,
        embedding_dimensions=chunks[0].embedding_dimensions if chunks else 512,
    )

    doc_row = {
        "entity_id": payload.document_entity_id,
        "title": payload.title,
        "doc_type": payload.doc_type,
        "source_path": payload.source_path,
        "sha256": payload.sha256,
        "chunk_count": len(chunks),
        "page_count": payload.page_count,
        "document_date": payload.document_date,
        "embedding_model": chunks[0].embedding_model if chunks else None,
        "source_dataset": payload.filename,
        "source_record_id": f"document:{payload.filename}",
        "data_origin": data_origin.value,
        "ingestion_job_id": ingestion_job_id,
        "updated_at": updated_at,
    }

    chunk_rows = [
        {
            "entity_id": c.entity_id,
            "chunk_id": c.chunk_id,
            "document_entity_id": c.document_entity_id,
            "document_title": payload.title,
            "doc_type": payload.doc_type,
            "chunk_index": c.chunk_index,
            "page_number": c.page_number,
            "section_title": c.section_title,
            "page_or_section": c.page_or_section,
            "char_start": c.char_start,
            "char_end": c.char_end,
            "token_count": c.token_count,
            "text": c.text,
            "text_preview": c.text_preview,
            "sha256": c.sha256,
            "document_date": c.document_date,
            "embedding": c.embedding,
            "embedding_model": c.embedding_model,
            "embedding_dimensions": c.embedding_dimensions,
            "source_dataset": c.source_dataset,
            "source_record_id": c.source_record_id,
            "data_origin": data_origin.value,
            "ingestion_job_id": ingestion_job_id,
            "rel_source_record_id": f"{payload.document_entity_id}:CONTAINS_CHUNK:{c.chunk_index}",
        }
        for c in chunks
    ]

    link_rows = [
        {
            "chunk_entity_id": lk.chunk_entity_id,
            "target_entity_id": lk.target_entity_id,
            "confidence": lk.confidence,
            "match_type": lk.match_type,
            "matched_text": lk.matched_text,
            "evidence_excerpt": lk.evidence_excerpt,
            "char_start": lk.char_start,
            "char_end": lk.char_end,
            "source_dataset": lk.source_dataset,
            "source_record_id": lk.source_record_id,
            "data_origin": lk.data_origin.value if isinstance(lk.data_origin, DataOrigin) else str(lk.data_origin),
            "ingestion_job_id": lk.ingestion_job_id,
        }
        for lk in links
    ]

    with client.session() as sess:
        sess.run(
            """
            MERGE (d:Document:CortexEntity {entityId: $row.entity_id})
            SET d.title = $row.title,
                d.docType = $row.doc_type,
                d.sourcePath = $row.source_path,
                d.sha256 = $row.sha256,
                d.chunkCount = $row.chunk_count,
                d.pageCount = $row.page_count,
                d.documentDate = $row.document_date,
                d.embeddingModel = $row.embedding_model,
                d.sourceDataset = $row.source_dataset,
                d.sourceRecordId = $row.source_record_id,
                d.dataOrigin = $row.data_origin,
                d.ingestionJobId = $row.ingestion_job_id,
                d.updatedAt = $row.updated_at
            """,
            row=doc_row,
        ).consume()

        # Remove stale chunks if document shrunk on re-ingestion
        sess.run(
            """
            MATCH (d:Document {entityId: $doc_id})-[:CONTAINS_CHUNK]->(old:DocumentChunk)
            WHERE old.chunkIndex >= $new_count
            DETACH DELETE old
            """,
            doc_id=payload.document_entity_id,
            new_count=len(chunk_rows),
        ).consume()

        if chunk_rows:
            sess.run(
                """
                UNWIND $rows AS row
                MATCH (d:Document {entityId: row.document_entity_id})
                MERGE (c:DocumentChunk:CortexEntity {entityId: row.entity_id})
                SET c.chunkId = row.chunk_id,
                    c.documentEntityId = row.document_entity_id,
                    c.documentTitle = row.document_title,
                    c.docType = row.doc_type,
                    c.chunkIndex = row.chunk_index,
                    c.pageNumber = row.page_number,
                    c.sectionTitle = row.section_title,
                    c.pageOrSection = row.page_or_section,
                    c.charStart = row.char_start,
                    c.charEnd = row.char_end,
                    c.tokenCount = row.token_count,
                    c.text = row.text,
                    c.textPreview = row.text_preview,
                    c.sha256 = row.sha256,
                    c.documentDate = row.document_date,
                    c.embedding = row.embedding,
                    c.embeddingModel = row.embedding_model,
                    c.embeddingDimensions = row.embedding_dimensions,
                    c.sourceDataset = row.source_dataset,
                    c.sourceRecordId = row.source_record_id,
                    c.dataOrigin = row.data_origin,
                    c.ingestionJobId = row.ingestion_job_id
                MERGE (d)-[r:CONTAINS_CHUNK {sourceRecordId: row.rel_source_record_id}]->(c)
                SET r.sourceDataset = row.source_dataset,
                    r.dataOrigin = row.data_origin,
                    r.ingestionJobId = row.ingestion_job_id
                """,
                rows=chunk_rows,
            ).consume()

        # Refresh MENTIONS edges on updated chunks cleanly
        sess.run(
            """
            MATCH (d:Document {entityId: $doc_id})-[:CONTAINS_CHUNK]->(c:DocumentChunk)-[r:MENTIONS]->()
            DELETE r
            """,
            doc_id=payload.document_entity_id,
        ).consume()

        if link_rows:
            sess.run(
                """
                UNWIND $rows AS row
                MATCH (c:DocumentChunk {entityId: row.chunk_entity_id})
                MATCH (e:CortexEntity {entityId: row.target_entity_id})
                MERGE (c)-[r:MENTIONS {sourceRecordId: row.source_record_id}]->(e)
                SET r.confidence = row.confidence,
                    r.matchType = row.match_type,
                    r.matchedText = row.matched_text,
                    r.evidenceExcerpt = row.evidence_excerpt,
                    r.charStart = row.char_start,
                    r.charEnd = row.char_end,
                    r.sourceDataset = row.source_dataset,
                    r.dataOrigin = row.data_origin,
                    r.ingestionJobId = row.ingestion_job_id
                """,
                rows=link_rows,
            ).consume()

        sess.run("CALL db.awaitIndexes(30)").consume()

    return {
        "chunks_upserted": len(chunk_rows),
        "entity_links_upserted": len(link_rows),
    }


def list_documents_in_neo4j(
    client: Neo4jClient,
    data_origin: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[DocumentSummary]:
    with client.session() as sess:
        rows = sess.run(
            """
            MATCH (d:Document)
            WHERE ($origin IS NULL OR d.dataOrigin = $origin)
            OPTIONAL MATCH (d)-[:CONTAINS_CHUNK]->(c:DocumentChunk)-[m:MENTIONS]->(e:CortexEntity)
            WITH d, count(DISTINCT c) AS actualChunks, count(DISTINCT e) AS linkedEntities
            RETURN d.entityId AS entityId,
                   d.title AS title,
                   d.docType AS docType,
                   d.sourcePath AS sourcePath,
                   d.sha256 AS sha256,
                   CASE WHEN actualChunks > 0 THEN actualChunks ELSE coalesce(d.chunkCount, 0) END AS chunkCount,
                   linkedEntities,
                   d.pageCount AS pageCount,
                   d.documentDate AS documentDate,
                   d.embeddingModel AS embeddingModel,
                   d.dataOrigin AS dataOrigin,
                   d.sourceDataset AS sourceDataset,
                   d.ingestionJobId AS ingestionJobId,
                   d.updatedAt AS updatedAt
            ORDER BY coalesce(d.updatedAt, '') DESC, entityId ASC
            SKIP $offset LIMIT $limit
            """,
            origin=data_origin,
            offset=max(0, offset),
            limit=max(1, min(limit, 200)),
        )
        return [
            DocumentSummary(
                entity_id=str(r["entityId"]),
                title=str(r["title"]),
                doc_type=str(r["docType"]),
                source_path=str(r["sourcePath"]),
                sha256=str(r["sha256"]),
                chunk_count=int(r["chunkCount"] or 0),
                linked_entity_count=int(r["linkedEntities"] or 0),
                page_count=r["pageCount"],
                document_date=r["documentDate"],
                embedding_model=r["embeddingModel"],
                data_origin=str(r["dataOrigin"]),
                source_dataset=str(r["sourceDataset"]),
                ingestion_job_id=str(r["ingestionJobId"]),
                updated_at=r["updatedAt"],
            )
            for r in rows
        ]


def list_chunks_in_neo4j(
    client: Neo4jClient,
    document_id: str | None = None,
    entity_id: str | None = None,
    data_origin: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ChunkInspectionRecord]:
    with client.session() as sess:
        rows = sess.run(
            """
            MATCH (d:Document)-[:CONTAINS_CHUNK]->(c:DocumentChunk)
            WHERE ($doc_id IS NULL OR d.entityId = $doc_id)
              AND ($origin IS NULL OR c.dataOrigin = $origin)
              AND ($target_entity IS NULL OR EXISTS {
                    MATCH (c)-[:MENTIONS]->(:CortexEntity {entityId: $target_entity})
                  })
            OPTIONAL MATCH (c)-[m:MENTIONS]->(e:CortexEntity)
            WITH d, c, collect(
                CASE WHEN e IS NULL THEN NULL ELSE {
                    entity_id: e.entityId,
                    labels: [l IN labels(e) WHERE l <> 'CortexEntity'],
                    display_name: coalesce(e.name, e.label, e.title, e.poCode, e.regionName, e.entityId),
                    data_origin: e.dataOrigin,
                    confidence: m.confidence,
                    match_type: m.matchType,
                    matched_text: m.matchedText,
                    evidence_excerpt: m.evidenceExcerpt
                } END
            ) AS linked
            RETURN c.entityId AS entityId,
                   c.chunkId AS chunkId,
                   c.documentEntityId AS documentEntityId,
                   d.title AS documentTitle,
                   c.chunkIndex AS chunkIndex,
                   c.pageNumber AS pageNumber,
                   c.sectionTitle AS sectionTitle,
                   c.pageOrSection AS pageOrSection,
                   c.charStart AS charStart,
                   c.charEnd AS charEnd,
                   c.tokenCount AS tokenCount,
                   c.text AS text,
                   c.textPreview AS textPreview,
                   c.sha256 AS sha256,
                   c.documentDate AS documentDate,
                   c.embeddingModel AS embeddingModel,
                   c.embeddingDimensions AS embeddingDimensions,
                   c.dataOrigin AS dataOrigin,
                   c.sourceDataset AS sourceDataset,
                   c.sourceRecordId AS sourceRecordId,
                   c.ingestionJobId AS ingestionJobId,
                   [x IN linked WHERE x IS NOT NULL] AS linkedEntities
            ORDER BY c.documentEntityId ASC, c.chunkIndex ASC
            SKIP $offset LIMIT $limit
            """,
            doc_id=document_id,
            origin=data_origin,
            target_entity=entity_id,
            offset=max(0, offset),
            limit=max(1, min(limit, 200)),
        )
        return [
            ChunkInspectionRecord(
                entity_id=str(r["entityId"]),
                chunk_id=str(r["chunkId"]),
                document_entity_id=str(r["documentEntityId"]),
                document_title=r["documentTitle"],
                chunk_index=int(r["chunkIndex"]),
                page_number=r["pageNumber"],
                section_title=r["sectionTitle"],
                page_or_section=str(r["pageOrSection"]),
                char_start=int(r["charStart"]),
                char_end=int(r["charEnd"]),
                token_count=int(r["tokenCount"]),
                text=str(r["text"]),
                text_preview=str(r["textPreview"]),
                sha256=str(r["sha256"]),
                document_date=r["documentDate"],
                embedding_model=r["embeddingModel"],
                embedding_dimensions=r["embeddingDimensions"],
                data_origin=str(r["dataOrigin"]),
                source_dataset=str(r["sourceDataset"]),
                source_record_id=str(r["sourceRecordId"]),
                ingestion_job_id=str(r["ingestionJobId"]),
                linked_entities=sorted(
                    list(r["linkedEntities"] or []),
                    key=lambda item: (-(item.get("confidence") or 0.0), str(item.get("entity_id") or "")),
                ),
            )
            for r in rows
        ]


def get_document_with_chunks_in_neo4j(
    client: Neo4jClient,
    document_id: str,
    limit: int = 200,
) -> dict[str, Any] | None:
    docs = list_documents_in_neo4j(client, limit=200)
    doc = next((d for d in docs if d.entity_id == document_id), None)
    if doc is None:
        return None
    chunks = list_chunks_in_neo4j(client, document_id=document_id, limit=limit)
    return {
        "document": doc.model_dump(mode="json"),
        "chunks": [c.model_dump(mode="json") for c in chunks],
    }


def vector_search_chunks_neo4j(
    client: Neo4jClient,
    query_vector: list[float],
    top_k: int = 12,
    allowed_origins: list[str] | None = None,
    min_score: float = 0.62,
) -> list[dict[str, Any]]:
    fetch_k = max(top_k * 3, 24)
    with client.session() as sess:
        rows = sess.run(
            """
            CALL db.index.vector.queryNodes('cortex_chunk_embedding_idx', $fetch_k, $query_vector)
            YIELD node AS c, score
            WHERE score >= $min_score
              AND ($allowed_origins IS NULL OR c.dataOrigin IN $allowed_origins)
            OPTIONAL MATCH (d:Document)-[:CONTAINS_CHUNK]->(c)
            OPTIONAL MATCH (c)-[m:MENTIONS]->(e:CortexEntity)
            WITH c, score, d, collect(
                CASE WHEN e IS NULL THEN NULL ELSE {
                    entity_id: e.entityId,
                    labels: [l IN labels(e) WHERE l <> 'CortexEntity'],
                    display_name: coalesce(e.name, e.label, e.title, e.poCode, e.regionName, e.entityId),
                    data_origin: e.dataOrigin,
                    confidence: m.confidence,
                    match_type: m.matchType,
                    matched_text: m.matchedText,
                    evidence_excerpt: m.evidenceExcerpt
                } END
            ) AS linked
            RETURN c.entityId AS entityId,
                   c.chunkId AS chunkId,
                   c.documentEntityId AS documentEntityId,
                   coalesce(d.title, c.documentTitle, c.sourceDataset) AS documentTitle,
                   coalesce(d.docType, c.docType, 'txt') AS docType,
                   c.dataOrigin AS dataOrigin,
                   c.documentDate AS documentDate,
                   c.pageOrSection AS pageOrSection,
                   c.pageNumber AS pageNumber,
                   c.sectionTitle AS sectionTitle,
                   c.text AS text,
                   c.textPreview AS textPreview,
                   c.sourceDataset AS sourceDataset,
                   c.sourceRecordId AS sourceRecordId,
                   score,
                   [x IN linked WHERE x IS NOT NULL] AS linkedEntities
            ORDER BY score DESC
            LIMIT $top_k
            """,
            fetch_k=fetch_k,
            query_vector=query_vector,
            min_score=min_score,
            allowed_origins=allowed_origins,
            top_k=top_k,
        )
        return [dict(r) for r in rows]


def fulltext_search_chunks_neo4j(
    client: Neo4jClient,
    query_text: str,
    top_k: int = 12,
    allowed_origins: list[str] | None = None,
) -> list[dict[str, Any]]:
    lucene_query = escape_lucene_query(query_text)
    with client.session() as sess:
        rows = sess.run(
            """
            CALL db.index.fulltext.queryNodes('cortex_chunk_fulltext_idx', $lucene_query, {limit: $fetch_k})
            YIELD node AS c, score
            WHERE $allowed_origins IS NULL OR c.dataOrigin IN $allowed_origins
            OPTIONAL MATCH (d:Document)-[:CONTAINS_CHUNK]->(c)
            OPTIONAL MATCH (c)-[m:MENTIONS]->(e:CortexEntity)
            WITH c, score, d, collect(
                CASE WHEN e IS NULL THEN NULL ELSE {
                    entity_id: e.entityId,
                    labels: [l IN labels(e) WHERE l <> 'CortexEntity'],
                    display_name: coalesce(e.name, e.label, e.title, e.poCode, e.regionName, e.entityId),
                    data_origin: e.dataOrigin,
                    confidence: m.confidence,
                    match_type: m.matchType,
                    matched_text: m.matchedText,
                    evidence_excerpt: m.evidenceExcerpt
                } END
            ) AS linked
            RETURN c.entityId AS entityId,
                   c.chunkId AS chunkId,
                   c.documentEntityId AS documentEntityId,
                   coalesce(d.title, c.documentTitle, c.sourceDataset) AS documentTitle,
                   coalesce(d.docType, c.docType, 'txt') AS docType,
                   c.dataOrigin AS dataOrigin,
                   c.documentDate AS documentDate,
                   c.pageOrSection AS pageOrSection,
                   c.pageNumber AS pageNumber,
                   c.sectionTitle AS sectionTitle,
                   c.text AS text,
                   c.textPreview AS textPreview,
                   c.sourceDataset AS sourceDataset,
                   c.sourceRecordId AS sourceRecordId,
                   score,
                   [x IN linked WHERE x IS NOT NULL] AS linkedEntities
            ORDER BY score DESC
            LIMIT $top_k
            """,
            lucene_query=lucene_query,
            fetch_k=max(top_k * 3, 24),
            allowed_origins=allowed_origins,
            top_k=top_k,
        )
        return [dict(r) for r in rows]


def fulltext_search_entities_neo4j(
    client: Neo4jClient,
    query_text: str,
    limit: int = 12,
    include_demonstration: bool = False,
) -> list[dict[str, Any]]:
    lucene_query = escape_lucene_query(query_text)
    with client.session() as sess:
        rows = sess.run(
            """
            CALL db.index.fulltext.queryNodes('cortex_entity_fulltext_idx', $lucene_query, {limit: $fetch_limit})
            YIELD node AS n, score
            WHERE ($include_demo = true OR coalesce(n.dataOrigin, '') <> 'demonstration')
            RETURN n.entityId AS entityId,
                   [l IN labels(n) WHERE l <> 'CortexEntity'] AS labels,
                   coalesce(n.name, n.label, n.title, n.poCode, n.regionName, n.entityId) AS displayName,
                   coalesce(n.supplierCode, n.warehouseCode, n.poCode, n.productCode, n.originalId) AS code,
                   n.dataOrigin AS dataOrigin,
                   score
            ORDER BY score DESC
            LIMIT $limit
            """,
            lucene_query=lucene_query,
            fetch_limit=max(limit * 3, 25),
            include_demo=include_demonstration,
            limit=limit,
        )
        return [dict(r) for r in rows]


def in_memory_hybrid_chunk_search(
    chunks: list[ChunkInspectionRecord | ChunkRecord],
    query_text: str,
    query_vector: list[float],
    embeddings_by_chunk_id: dict[str, list[float]] | None = None,
    allowed_origins: list[str] | None = None,
    top_k: int = 8,
) -> list[dict[str, Any]]:
    """Pure-Python cosine + lexical fallback scorer for unit testing without live Neo4j."""
    q_terms = {t.lower() for t in re.findall(r"[A-Za-z0-9_-]{3,}", query_text)}
    scored: list[dict[str, Any]] = []
    for ch in chunks:
        origin = ch.data_origin.value if isinstance(ch.data_origin, DataOrigin) else str(ch.data_origin)
        if allowed_origins is not None and origin not in allowed_origins:
            continue
        vec = (
            ch.embedding
            if isinstance(ch, ChunkRecord) and ch.embedding
            else (embeddings_by_chunk_id or {}).get(ch.entity_id, [])
        )
        v_score = max(0.0, cosine_similarity(query_vector, vec))
        c_terms = set(re.findall(r"[A-Za-z0-9_-]{3,}", ch.text.lower()))
        overlap = len(q_terms & c_terms) / max(1, len(q_terms))
        if v_score <= 0.05 and overlap == 0.0:
            continue
        scored.append(
            {
                "entityId": ch.entity_id,
                "chunkId": ch.chunk_id,
                "documentEntityId": ch.document_entity_id,
                "documentTitle": getattr(ch, "document_title", None) or ch.source_dataset,
                "docType": getattr(ch, "doc_type", "txt"),
                "dataOrigin": origin,
                "documentDate": ch.document_date,
                "pageOrSection": ch.page_or_section,
                "pageNumber": ch.page_number,
                "sectionTitle": ch.section_title,
                "text": ch.text,
                "textPreview": ch.text_preview,
                "sourceDataset": ch.source_dataset,
                "sourceRecordId": ch.source_record_id,
                "vector_score": round(v_score, 4),
                "keyword_score": round(overlap, 4),
                "linkedEntities": getattr(ch, "linked_entities", []),
            }
        )
    scored.sort(key=lambda r: (-(0.6 * r["vector_score"] + 0.4 * r["keyword_score"]), r["entityId"]))
    return scored[:top_k]
