from __future__ import annotations

import re

from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.models import (
    ChunkRecord,
    EntityCatalogEntry,
    EntityLinkRecord,
)
from cortex_intelligence.models.canonical import DataOrigin

_EXPLICIT_ORDER_ID_RE = re.compile(r"\bdataco:order:(\d+)\b|\border\s+#?(\d{4,7})\b", re.IGNORECASE)
_STOP_ALIAS_WORDS = {
    "company", "corp", "corporation", "components", "enterprise", "global", "group",
    "holdings", "inc", "industries", "international", "logistics", "ltd", "manufacturing",
    "products", "services", "solutions", "supply", "synthetic", "systems", "warehouse",
}


def load_entity_catalog_from_neo4j(client: Neo4jClient) -> list[EntityCatalogEntry]:
    """Load linkable canonical entities from Neo4j (excluding high-cardinality Order/Shipment/Chunk tables)."""
    catalog: list[EntityCatalogEntry] = []
    with client.session() as sess:
        rows = sess.run(
            """
            MATCH (n:CortexEntity)
            WHERE any(l IN labels(n) WHERE l IN [
                'Supplier', 'Warehouse', 'PurchaseOrder', 'Product',
                'Inventory', 'ProductCategory', 'Department', 'Region',
                'CustomerSegment', 'DemoEntity'
            ])
            RETURN n.entityId AS entityId,
                   [l IN labels(n) WHERE l <> 'CortexEntity'] AS labels,
                   coalesce(n.name, n.label, n.title, n.poCode, n.regionName, n.entityId) AS displayName,
                   coalesce(n.supplierCode, n.warehouseCode, n.poCode, n.productCode, n.originalId) AS code,
                   n.regionName AS regionName,
                   n.market AS market,
                   coalesce(n.dataOrigin, 'unknown') AS dataOrigin
            ORDER BY entityId
            """
        )
        for r in rows:
            labels = list(r["labels"] or [])
            display_name = str(r["displayName"] or r["entityId"]).strip()
            code = str(r["code"]).strip() if r["code"] else None
            aliases: list[str] = []

            if "Warehouse" in labels and code:
                short_name = display_name.replace("Synthetic Warehouse ", "").strip()
                if short_name and short_name != display_name:
                    aliases.append(short_name)
            if "Region" in labels and r["regionName"]:
                aliases.append(str(r["regionName"]).strip())
            if "Product" in labels and len(display_name) >= 24:
                words = display_name.split()
                if len(words) >= 3:
                    prefix_phrase = " ".join(words[:3])
                    if len(prefix_phrase) >= 12:
                        aliases.append(prefix_phrase)
            if "Supplier" in labels and len(display_name.split()) >= 2:
                significant = [w for w in display_name.split() if w.lower() not in _STOP_ALIAS_WORDS]
                if len(significant) >= 1 and len(" ".join(significant)) >= 6:
                    aliases.append(" ".join(significant))

            catalog.append(
                EntityCatalogEntry(
                    entity_id=str(r["entityId"]),
                    labels=labels,
                    display_name=display_name,
                    code=code,
                    aliases=aliases,
                    data_origin=str(r["dataOrigin"]),
                )
            )
    return catalog


def _lookup_explicit_orders(client: Neo4jClient, text: str) -> list[EntityCatalogEntry]:
    order_ids: set[str] = set()
    for match in _EXPLICIT_ORDER_ID_RE.finditer(text):
        oid = match.group(1) or match.group(2)
        if oid:
            order_ids.add(f"dataco:order:{oid}")
    if not order_ids:
        return []

    found: list[EntityCatalogEntry] = []
    with client.session() as sess:
        rows = sess.run(
            """
            UNWIND $ids AS eid
            MATCH (o:Order {entityId: eid})
            RETURN o.entityId AS entityId, o.orderCode AS code, coalesce(o.dataOrigin, 'public_open_dataset') AS dataOrigin
            """,
            ids=list(order_ids),
        )
        for r in rows:
            found.append(
                EntityCatalogEntry(
                    entity_id=str(r["entityId"]),
                    labels=["Order"],
                    display_name=f"Order {r['code']}",
                    code=str(r["code"]) if r["code"] else None,
                    aliases=[],
                    data_origin=str(r["dataOrigin"]),
                )
            )
    return found


def _build_word_boundary_pattern(term: str) -> re.Pattern[str]:
    escaped = re.escape(term)
    return re.compile(rf"(?<![A-Za-z0-9]){escaped}(?![A-Za-z0-9])", re.IGNORECASE)


def _extract_excerpt(text: str, start: int, end: int, radius: int = 65) -> str:
    left = max(0, start - radius)
    right = min(len(text), end + radius)
    snippet = text[left:right].replace("\n", " ").strip()
    if left > 0:
        snippet = "..." + snippet
    if right < len(text):
        snippet = snippet + "..."
    return snippet


def link_chunks_to_entities(
    chunks: list[ChunkRecord],
    catalog: list[EntityCatalogEntry],
    ingestion_job_id: str,
    neo4j_client: Neo4jClient | None = None,
    min_confidence: float = 0.70,
) -> list[EntityLinkRecord]:
    """Detect and score entity mentions inside document chunks with exact evidence excerpts."""
    if not chunks:
        return []

    combined_text = "\n".join(c.text for c in chunks)
    extended_catalog = list(catalog)
    if neo4j_client is not None:
        existing_ids = {e.entity_id for e in extended_catalog}
        for order_entry in _lookup_explicit_orders(neo4j_client, combined_text):
            if order_entry.entity_id not in existing_ids:
                extended_catalog.append(order_entry)
                existing_ids.add(order_entry.entity_id)

    # Pre-compile search patterns once per entity
    compiled_patterns: list[
        tuple[EntityCatalogEntry, str, float, re.Pattern[str]]
    ] = []
    for entry in extended_catalog:
        if len(entry.entity_id) >= 5:
            compiled_patterns.append(
                (entry, "exact_entity_id", 0.99, _build_word_boundary_pattern(entry.entity_id))
            )
        if entry.code and len(entry.code) >= 4 and not entry.code.isdigit():
            compiled_patterns.append(
                (entry, "exact_code", 0.95, _build_word_boundary_pattern(entry.code))
            )
        elif entry.code and entry.code.isdigit() and len(entry.code) >= 3:
            # Numeric Product IDs only link when paired with explicit SKU/Prod prefix or exact full product name
            prod_pattern = re.compile(
                rf"\b(?:product|sku|prod)\s*[:#-]?\s*{re.escape(entry.code)}\b",
                re.IGNORECASE,
            )
            compiled_patterns.append((entry, "exact_code", 0.93, prod_pattern))

        if entry.display_name and len(entry.display_name) >= 5 and entry.display_name.lower() != entry.entity_id.lower():
            conf = 0.91 if len(entry.display_name) >= 8 else 0.86
            compiled_patterns.append(
                (entry, "exact_name", conf, _build_word_boundary_pattern(entry.display_name))
            )

        for alias in entry.aliases:
            if len(alias) >= 5:
                compiled_patterns.append(
                    (entry, "alias_or_partial_phrase", 0.78, _build_word_boundary_pattern(alias))
                )

    links: list[EntityLinkRecord] = []
    for chunk in chunks:
        best_by_entity: dict[str, EntityLinkRecord] = {}
        chunk_is_demo = (
            chunk.data_origin == DataOrigin.DEMONSTRATION
            or str(chunk.data_origin) == DataOrigin.DEMONSTRATION.value
        )
        for entry, match_type, confidence, pattern in compiled_patterns:
            if confidence < min_confidence:
                continue
            # Strictly isolate demonstration data from public/synthetic/enterprise links in both directions
            entry_origin_val = (
                entry.data_origin.value
                if isinstance(entry.data_origin, DataOrigin)
                else str(entry.data_origin)
            )
            target_is_demo = entry_origin_val == DataOrigin.DEMONSTRATION.value
            if chunk_is_demo != target_is_demo:
                continue
            m = pattern.search(chunk.text)
            if not m:
                continue
            prev = best_by_entity.get(entry.entity_id)
            if prev is not None and prev.confidence >= confidence:
                continue
            best_by_entity[entry.entity_id] = EntityLinkRecord(
                chunk_entity_id=chunk.entity_id,
                target_entity_id=entry.entity_id,
                target_labels=entry.labels,
                target_display_name=entry.display_name,
                target_data_origin=entry_origin_val,
                confidence=round(confidence, 3),
                match_type=match_type,  # type: ignore[arg-type]
                matched_text=m.group(0),
                evidence_excerpt=_extract_excerpt(chunk.text, m.start(), m.end()),
                char_start=m.start(),
                char_end=m.end(),
                source_dataset=chunk.source_dataset,
                source_record_id=f"{chunk.chunk_id}:MENTIONS:{entry.entity_id}",
                data_origin=chunk.data_origin if isinstance(chunk.data_origin, DataOrigin) else DataOrigin.ENTERPRISE_DOCUMENT,
                ingestion_job_id=ingestion_job_id,
            )

        links.extend(
            sorted(best_by_entity.values(), key=lambda x: (-x.confidence, x.target_entity_id))
        )
    return links
