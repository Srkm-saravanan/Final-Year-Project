from __future__ import annotations

import re
from typing import Any

from cortex_intelligence.config import Settings, get_settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.embeddings import EmbeddingProvider, build_embedding_provider
from cortex_intelligence.graphrag.models import (
    GraphPathHop,
    GraphPathRecord,
    GraphRAGRetrievalResult,
    GraphRAGRetrieveRequest,
    OriginSeparatedEvidence,
    RetrievedChunkEvidence,
    TemporalFilterSummary,
)
from cortex_intelligence.graphrag.vector_store import (
    fulltext_search_chunks_neo4j,
    fulltext_search_entities_neo4j,
    vector_search_chunks_neo4j,
)

_EXPLICIT_ENTITY_CODE_RE = re.compile(
    r"\b(?:syn:(?:supplier|warehouse|po|inventory):[A-Za-z0-9:_-]+|"
    r"dataco:(?:prod|order|category|dept|region):[A-Za-z0-9:_-]+|"
    r"demo:[A-Za-z0-9:_-]+|"
    r"SYN-(?:SUP|WH|PO)-\d+)\b",
    re.IGNORECASE,
)

_STOPWORDS = frozenset(
    {
        "the", "and", "for", "with", "that", "this", "from", "what", "which", "when",
        "where", "who", "whom", "whose", "why", "how", "are", "was", "were", "will",
        "would", "could", "should", "have", "has", "had", "into", "about", "there",
        "their", "they", "them", "then", "than", "any", "all", "can", "did", "does",
        "not", "but", "out", "currently", "linked", "affect", "affected", "impact",
    }
)


def _substantive_query_tokens(query_text: str) -> set[str]:
    tokens = {t.lower() for t in re.findall(r"[A-Za-z0-9]{3,}", query_text)}
    return {t for t in tokens if t not in _STOPWORDS}


def _chunk_passes_relevance_gate(
    query_tokens: set[str],
    chunk: RetrievedChunkEvidence,
) -> bool:
    if "graph_mention" in chunk.retrieval_channels:
        return True
    if chunk.vector_score >= 0.63:
        return True
    if not query_tokens:
        return False
    chunk_tokens = {
        t.lower()
        for t in re.findall(
            r"[A-Za-z0-9]{3,}",
            f"{chunk.document_title} {chunk.section_title or ''} {chunk.text}",
        )
    }
    overlap = len(query_tokens & chunk_tokens)
    min_needed = 1 if len(query_tokens) <= 2 else 2
    return overlap >= min_needed and (overlap / len(query_tokens)) >= 0.34


def _normalize_date_bound(value: str | None, end_of_day: bool = False) -> str | None:
    if not value or not value.strip():
        return None
    cleaned = value.strip()
    if len(cleaned) == 10 and "T" not in cleaned:
        return f"{cleaned}T23:59:59" if end_of_day else f"{cleaned}T00:00:00"
    return cleaned


def _lookup_explicit_anchor_entities(
    client: Neo4jClient,
    query_text: str,
    include_demonstration: bool,
) -> list[dict[str, Any]]:
    raw_tokens = {m.group(0) for m in _EXPLICIT_ENTITY_CODE_RE.finditer(query_text)}
    if not raw_tokens:
        return []

    candidate_ids: set[str] = set()
    candidate_codes: set[str] = set()
    for tok in raw_tokens:
        upper = tok.upper()
        lower = tok.lower()
        if ":" in tok:
            candidate_ids.add(lower if lower.startswith(("dataco:", "demo:")) else tok)
            if lower.startswith("syn:"):
                parts = tok.split(":")
                if len(parts) >= 3:
                    candidate_ids.add(f"{parts[0].lower()}:{parts[1].lower()}:{':'.join(parts[2:]).upper()}")
        elif upper.startswith("SYN-SUP-"):
            candidate_codes.add(upper)
            candidate_ids.add(f"syn:supplier:{upper}")
        elif upper.startswith("SYN-WH-"):
            candidate_codes.add(upper)
            candidate_ids.add(f"syn:warehouse:{upper}")
        elif upper.startswith("SYN-PO-"):
            candidate_codes.add(upper)
            candidate_ids.add(f"syn:po:{upper}")

    with client.session() as sess:
        rows = sess.run(
            """
            MATCH (n:CortexEntity)
            WHERE (n.entityId IN $ids
                   OR toUpper(coalesce(n.supplierCode, '')) IN $codes
                   OR toUpper(coalesce(n.warehouseCode, '')) IN $codes
                   OR toUpper(coalesce(n.poCode, '')) IN $codes)
              AND ($include_demo = true OR coalesce(n.dataOrigin, '') <> 'demonstration')
            RETURN n.entityId AS entityId,
                   [l IN labels(n) WHERE l <> 'CortexEntity'] AS labels,
                   coalesce(n.name, n.label, n.title, n.poCode, n.regionName, n.entityId) AS displayName,
                   coalesce(n.supplierCode, n.warehouseCode, n.poCode, n.productCode, n.originalId) AS code,
                   n.dataOrigin AS dataOrigin,
                   10.0 AS score
            """,
            ids=list(candidate_ids),
            codes=list(candidate_codes),
            include_demo=include_demonstration,
        )
        return [dict(r) for r in rows]


def _chunks_for_entities_neo4j(
    client: Neo4jClient,
    entity_ids: list[str],
    allowed_origins: list[str] | None,
    limit: int = 8,
) -> list[dict[str, Any]]:
    if not entity_ids:
        return []
    with client.session() as sess:
        rows = sess.run(
            """
            UNWIND $entity_ids AS eid
            MATCH (c:DocumentChunk)-[m:MENTIONS]->(target:CortexEntity {entityId: eid})
            WHERE ($allowed_origins IS NULL OR c.dataOrigin IN $allowed_origins)
            OPTIONAL MATCH (d:Document)-[:CONTAINS_CHUNK]->(c)
            WITH c, d, max(m.confidence) AS bestConf, count(DISTINCT target) AS matchedTargetCount
            OPTIONAL MATCH (c)-[allM:MENTIONS]->(e:CortexEntity)
            WITH c, d, bestConf, matchedTargetCount, collect(
                CASE WHEN e IS NULL THEN NULL ELSE {
                    entity_id: e.entityId,
                    labels: [l IN labels(e) WHERE l <> 'CortexEntity'],
                    display_name: coalesce(e.name, e.label, e.title, e.poCode, e.regionName, e.entityId),
                    data_origin: e.dataOrigin,
                    confidence: allM.confidence,
                    match_type: allM.matchType,
                    matched_text: allM.matchedText,
                    evidence_excerpt: allM.evidenceExcerpt
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
                   (bestConf + matchedTargetCount * 0.25) AS score,
                   [x IN linked WHERE x IS NOT NULL] AS linkedEntities
            ORDER BY score DESC, c.chunkIndex ASC
            LIMIT $limit
            """,
            entity_ids=entity_ids,
            allowed_origins=allowed_origins,
            limit=limit,
        )
        return [dict(r) for r in rows]


def fuse_chunk_candidates_rrf(
    vector_rows: list[dict[str, Any]],
    keyword_rows: list[dict[str, Any]],
    graph_mention_rows: list[dict[str, Any]],
    anchor_entity_ids: set[str],
    top_k: int = 6,
    rrf_k: int = 60,
) -> list[RetrievedChunkEvidence]:
    """Combine vector, keyword, and graph-mention retrieval channels via Reciprocal Rank Fusion."""
    merged: dict[str, dict[str, Any]] = {}

    def _ensure(row: dict[str, Any]) -> dict[str, Any]:
        cid = str(row["entityId"])
        if cid not in merged:
            merged[cid] = {
                "row": row,
                "vector_score": 0.0,
                "keyword_score": 0.0,
                "graph_boost_score": 0.0,
                "rrf_score": 0.0,
                "channels": [],
            }
        return merged[cid]

    for rank, row in enumerate(vector_rows, start=1):
        slot = _ensure(row)
        slot["vector_score"] = round(float(row.get("score") or row.get("vector_score") or 0.0), 4)
        slot["rrf_score"] += 1.0 / (rrf_k + rank)
        if "vector" not in slot["channels"]:
            slot["channels"].append("vector")

    for rank, row in enumerate(keyword_rows, start=1):
        slot = _ensure(row)
        slot["keyword_score"] = round(float(row.get("score") or row.get("keyword_score") or 0.0), 4)
        slot["rrf_score"] += 1.0 / (rrf_k + rank)
        if "keyword" not in slot["channels"]:
            slot["channels"].append("keyword")

    for rank, row in enumerate(graph_mention_rows, start=1):
        slot = _ensure(row)
        slot["graph_boost_score"] = round(
            max(slot["graph_boost_score"], float(row.get("score") or 0.9)), 4
        )
        slot["rrf_score"] += 1.15 / (rrf_k + rank)
        if "graph_mention" not in slot["channels"]:
            slot["channels"].append("graph_mention")

    # Apply calibrated entity-overlap bonus if chunk links to resolved graph anchors
    for slot in merged.values():
        linked = slot["row"].get("linkedEntities") or []
        matching_links = [lk for lk in linked if lk.get("entity_id") in anchor_entity_ids]
        if matching_links:
            bonus = min(0.03, 0.01 * len(matching_links))
            slot["rrf_score"] += bonus
            slot["graph_boost_score"] = round(
                max(
                    slot["graph_boost_score"],
                    max(float(lk.get("confidence") or 0.8) for lk in matching_links),
                ),
                4,
            )
            if "graph_mention" not in slot["channels"]:
                slot["channels"].append("graph_mention")

    # Drop weak single-channel vector noise hits with zero lexical/graph corroboration
    filtered = [
        item
        for item in merged.values()
        if not (
            item["keyword_score"] == 0.0
            and item["graph_boost_score"] == 0.0
            and item["vector_score"] < 0.60
        )
    ]

    ranked = sorted(
        filtered,
        key=lambda item: (-item["rrf_score"], -item["vector_score"], item["row"]["entityId"]),
    )[:top_k]

    out: list[RetrievedChunkEvidence] = []
    for idx, item in enumerate(ranked, start=1):
        r = item["row"]
        linked_sorted = sorted(
            list(r.get("linkedEntities") or []),
            key=lambda lk: (-(lk.get("confidence") or 0.0), str(lk.get("entity_id") or "")),
        )
        out.append(
            RetrievedChunkEvidence(
                rank=idx,
                entity_id=str(r["entityId"]),
                chunk_id=str(r["chunkId"]),
                document_entity_id=str(r["documentEntityId"]),
                document_title=str(r.get("documentTitle") or r["documentEntityId"]),
                doc_type=str(r.get("docType") or "txt"),
                data_origin=str(r["dataOrigin"]),
                document_date=r.get("documentDate"),
                page_or_section=str(r.get("pageOrSection") or "section:root"),
                page_number=r.get("pageNumber"),
                section_title=r.get("sectionTitle"),
                text=str(r["text"]),
                text_preview=str(r.get("textPreview") or str(r["text"])[:200]),
                vector_score=item["vector_score"],
                keyword_score=item["keyword_score"],
                graph_boost_score=item["graph_boost_score"],
                rrf_score=round(item["rrf_score"], 6),
                retrieval_channels=item["channels"],
                linked_entities=linked_sorted,
                source_dataset=str(r.get("sourceDataset") or ""),
                source_record_id=str(r.get("sourceRecordId") or ""),
            )
        )
    return out


def _traverse_supplier_anchor(
    client: Neo4jClient,
    supplier_id: str,
    temporal_mode: str,
    as_of_bound: str,
    custom_start: str | None,
    custom_end: str | None,
) -> tuple[dict[str, Any], dict[str, Any], list[GraphPathRecord]]:
    with client.session() as sess:
        sup_row = sess.run(
            """
            MATCH (s:Supplier {entityId: $sid})
            RETURN s.entityId AS entityId, s.supplierCode AS code, s.name AS name,
                   s.tier AS tier, s.homeMarket AS homeMarket,
                   s.baseLeadTimeDays AS baseLeadTimeDays, s.reliabilityScore AS reliabilityScore,
                   s.dataOrigin AS dataOrigin
            """,
            sid=supplier_id,
        ).single()
        if sup_row is None:
            return {}, {}, []

        # Synthetic procurement footprint + delay details
        po_rows = [
            dict(r)
            for r in sess.run(
                """
                MATCH (s:Supplier {entityId: $sid})<-[:ORDERED_FROM]-(po:PurchaseOrder)-[:DELIVERS_TO]->(w:Warehouse)
                OPTIONAL MATCH (po)-[:CONTAINS]->(p:Product)
                OPTIONAL MATCH (po)-[:AFFECTS]->(inv:Inventory)
                RETURN po.entityId AS poEntityId,
                       po.poCode AS poCode,
                       po.status AS status,
                       po.isDelayed AS isDelayed,
                       po.delayDays AS delayDays,
                       po.delaySeverity AS delaySeverity,
                       po.delayCause AS delayCause,
                       po.orderDate AS orderDate,
                       po.expectedDeliveryDate AS expectedDeliveryDate,
                       po.totalOrderCost AS totalOrderCost,
                       w.entityId AS warehouseId,
                       w.name AS warehouseName,
                       p.entityId AS productId,
                       p.name AS productName,
                       inv.entityId AS inventoryId,
                       inv.shortageUnits AS shortageUnits,
                       inv.onHandUnits AS onHandUnits,
                       inv.safetyStockUnits AS safetyStockUnits
                ORDER BY po.isDelayed DESC, po.delayDays DESC, po.poCode ASC
                """,
                sid=supplier_id,
            )
        ]

        footprint = dict(
            sess.run(
                """
                MATCH (s:Supplier {entityId: $sid})-[:SUPPLIES]->(p:Product)
                OPTIONAL MATCH (p)-[:STORED_AT]->(w:Warehouse)
                OPTIONAL MATCH (inv:Inventory)-[:BELONGS_TO]->(p)
                RETURN collect(DISTINCT {entityId: p.entityId, productCode: p.productCode, name: p.name}) AS products,
                       collect(DISTINCT {entityId: w.entityId, warehouseCode: w.warehouseCode, name: w.name, market: w.market}) AS holdingWarehouses,
                       count(DISTINCT inv) AS totalInventorySlots,
                       count(DISTINCT CASE WHEN inv.isShortage = true THEN inv END) AS networkShortageSlots
                """,
                sid=supplier_id,
            ).single()
        )

        # Derive exact PO scenario calendar window from synthetic PO dates
        po_order_dates = [r["orderDate"] for r in po_rows if r.get("orderDate")]
        po_exp_dates = [r["expectedDeliveryDate"] for r in po_rows if r.get("expectedDeliveryDate")]
        win_start = custom_start or (min(po_order_dates) if po_order_dates else "2018-01-05T00:00:00")
        win_end = custom_end or (max(po_exp_dates) if po_exp_dates else "2018-02-11T23:59:59")

        order_stats = dict(
            sess.run(
                """
                MATCH (s:Supplier {entityId: $sid})-[:SUPPLIES]->(p:Product)<-[ci:CONTAINS]-(o:Order)
                OPTIONAL MATCH (o)-[:SHIPPED_VIA]->(sh:Shipment)-[:DELIVERED_TO]->(reg:Region)
                RETURN count(DISTINCT o) AS totalHistoricalOrders,
                       min(o.orderDate) AS minOrderDate,
                       max(o.orderDate) AS maxOrderDate,
                       round(coalesce(sum(ci.sales), 0), 2) AS totalHistoricalSalesUsd,
                       round(coalesce(sum(ci.profitPerOrder), 0), 2) AS totalHistoricalProfitUsd,
                       count(DISTINCT CASE WHEN o.orderDate >= $win_start AND o.orderDate <= $win_end THEN o END) AS overlapWindowOrders,
                       round(coalesce(sum(CASE WHEN o.orderDate >= $win_start AND o.orderDate <= $win_end THEN ci.sales ELSE 0 END), 0), 2) AS overlapWindowSalesUsd,
                       count(DISTINCT CASE WHEN o.orderDate < $win_start THEN o END) AS preScenarioHistoricalOrders,
                       count(DISTINCT CASE WHEN o.orderDate >= $as_of_bound THEN o END) AS currentActiveOrders,
                       count(DISTINCT reg) AS regionCount,
                       collect(DISTINCT reg.market)[0..6] AS markets,
                       sum(CASE WHEN sh.evalLateDeliveryRisk = 1 THEN 1 ELSE 0 END) AS historicalLateRiskLines
                """,
                sid=supplier_id,
                win_start=win_start,
                win_end=win_end,
                as_of_bound=as_of_bound,
            ).single()
        )

    delayed_pos = [r for r in po_rows if r.get("isDelayed")]
    dest_whs = sorted(
        {(r["warehouseId"], r["warehouseName"]) for r in delayed_pos if r.get("warehouseId")},
        key=lambda x: x[0],
    )
    affected_inv = sorted(
        {r["inventoryId"] for r in delayed_pos if r.get("inventoryId")}
    )

    synthetic_block = {
        "supplier": dict(sup_row),
        "scenario_window": {"start": win_start, "end": win_end},
        "total_purchase_orders": len(po_rows),
        "delayed_purchase_orders_count": len(delayed_pos),
        "delayed_purchase_orders": [
            {
                "po_entity_id": r["poEntityId"],
                "po_code": r["poCode"],
                "delay_days": r["delayDays"],
                "delay_severity": r["delaySeverity"],
                "delay_cause": r["delayCause"],
                "order_date": r["orderDate"],
                "expected_delivery_date": r["expectedDeliveryDate"],
                "destination_warehouse_id": r["warehouseId"],
                "destination_warehouse_name": r["warehouseName"],
                "product_id": r["productId"],
                "product_name": r["productName"],
                "affected_inventory_id": r["inventoryId"],
                "shortage_units": r["shortageUnits"],
            }
            for r in delayed_pos
        ],
        "delayed_po_destination_warehouses": [
            {"entity_id": wid, "name": wname} for wid, wname in dest_whs
        ],
        "holding_warehouses_count": len(footprint.get("holdingWarehouses") or []),
        "holding_warehouses": sorted(
            footprint.get("holdingWarehouses") or [], key=lambda x: str(x.get("entityId") or "")
        ),
        "directly_affected_shortage_inventory_count": len(affected_inv),
        "network_shortage_inventory_count": int(footprint.get("networkShortageSlots") or 0),
        "supplied_products_count": len(footprint.get("products") or []),
        "supplied_products": sorted(
            footprint.get("products") or [], key=lambda x: str(x.get("entityId") or "")
        ),
    }

    active_orders = (
        int(order_stats.get("overlapWindowOrders") or 0)
        if as_of_bound <= win_end
        else int(order_stats.get("currentActiveOrders") or 0)
    )

    historical_block = {
        "data_origin": "public_open_dataset",
        "temporal_mode": temporal_mode,
        "historical_order_date_range": {
            "min": order_stats.get("minOrderDate"),
            "max": order_stats.get("maxOrderDate"),
        },
        "overlapping_window_orders_count": int(order_stats.get("overlapWindowOrders") or 0),
        "overlapping_window_sales_usd": float(order_stats.get("overlapWindowSalesUsd") or 0.0),
        "current_active_orders_count": active_orders,
        "excluded_pre_scenario_orders_count": int(order_stats.get("preScenarioHistoricalOrders") or 0),
        "historical_all_years_demand_orders_count": (
            int(order_stats.get("totalHistoricalOrders") or 0)
            if temporal_mode != "strict_active"
            else active_orders
        ),
        "historical_all_years_orders_total": int(order_stats.get("totalHistoricalOrders") or 0),
        "historical_all_years_sales_usd": float(order_stats.get("totalHistoricalSalesUsd") or 0.0),
        "historical_all_years_profit_usd": float(order_stats.get("totalHistoricalProfitUsd") or 0.0),
        "historical_late_delivery_risk_lines": int(order_stats.get("historicalLateRiskLines") or 0),
        "markets_served_historically": list(order_stats.get("markets") or []),
        "causal_note": (
            "Public DataCo orders (2015–2018) are historical empirical demand benchmarks linked solely via shared Product SKUs; "
            "they are NEVER causally damaged by synthetic 2018-01 procurement delays."
        ),
    }

    paths: list[GraphPathRecord] = []
    for idx, po in enumerate(delayed_pos[:8], start=1):
        hops = [
            GraphPathHop(
                from_entity_id=str(sup_row["entityId"]),
                from_labels=["Supplier"],
                from_name=str(sup_row["name"]),
                from_origin="synthetic",
                relationship_type="HAS_DELAY",
                relationship_props={
                    "delayDays": po["delayDays"],
                    "severity": po["delaySeverity"],
                    "cause": po["delayCause"],
                },
                to_entity_id=str(po["poEntityId"]),
                to_labels=["PurchaseOrder"],
                to_name=str(po["poCode"]),
                to_origin="synthetic",
            ),
            GraphPathHop(
                from_entity_id=str(po["poEntityId"]),
                from_labels=["PurchaseOrder"],
                from_name=str(po["poCode"]),
                from_origin="synthetic",
                relationship_type="DELIVERS_TO",
                relationship_props={"expectedDeliveryDate": po["expectedDeliveryDate"]},
                to_entity_id=str(po["warehouseId"]),
                to_labels=["Warehouse"],
                to_name=str(po["warehouseName"]),
                to_origin="synthetic",
            ),
        ]
        if po.get("inventoryId") and po.get("productId"):
            hops.append(
                GraphPathHop(
                    from_entity_id=str(po["poEntityId"]),
                    from_labels=["PurchaseOrder"],
                    from_name=str(po["poCode"]),
                    from_origin="synthetic",
                    relationship_type="AFFECTS",
                    relationship_props={"shortageUnits": po["shortageUnits"]},
                    to_entity_id=str(po["inventoryId"]),
                    to_labels=["Inventory"],
                    to_name=str(po["inventoryId"]),
                    to_origin="synthetic",
                )
            )
            hops.append(
                GraphPathHop(
                    from_entity_id=str(po["inventoryId"]),
                    from_labels=["Inventory"],
                    from_name=str(po["inventoryId"]),
                    from_origin="synthetic",
                    relationship_type="BELONGS_TO",
                    relationship_props={},
                    to_entity_id=str(po["productId"]),
                    to_labels=["Product"],
                    to_name=str(po["productName"]),
                    to_origin="public_open_dataset",
                )
            )
        paths.append(
            GraphPathRecord(
                path_id=f"path-sup-delay-{idx}",
                summary=(
                    f"{sup_row['code']} ({sup_row['name']}) -[:HAS_DELAY {po['delayDays']}d]-> "
                    f"{po['poCode']} -[:DELIVERS_TO]-> {po['warehouseName']} & "
                    f"-[:AFFECTS]-> {po['inventoryId']} -[:BELONGS_TO]-> {po['productName']} ({po['productId']})"
                ),
                hops=hops,
                data_origins=["synthetic", "public_open_dataset"],
                temporal_window=f"{win_start[:10]}..{win_end[:10]} (synthetic PO scenario)",
                is_synthetic_scenario=True,
                is_historical_baseline=True,
                is_demonstration=False,
            )
        )

    return synthetic_block, historical_block, paths


def _traverse_secondary_anchors(
    client: Neo4jClient,
    anchors: list[dict[str, Any]],
    covered_ids: set[str],
    temporal_mode: str,
    win_start: str,
    win_end: str,
    include_demonstration: bool,
) -> tuple[list[GraphPathRecord], dict[str, Any], dict[str, Any]]:
    """Expand Warehouse, PurchaseOrder, Product, or isolated DemoEntity anchors cleanly."""
    extra_paths: list[GraphPathRecord] = []
    extra_product_summaries: list[dict[str, Any]] = []
    demo_records: list[dict[str, Any]] = []

    with client.session() as sess:
        for anchor in anchors[:8]:
            eid = str(anchor["entityId"])
            labels = set(anchor.get("labels") or [])
            if eid in covered_ids:
                continue

            if "Warehouse" in labels:
                rows = [
                    dict(r)
                    for r in sess.run(
                        """
                        MATCH (w:Warehouse {entityId: $wid})
                        OPTIONAL MATCH (po:PurchaseOrder)-[:DELIVERS_TO]->(w)
                        OPTIONAL MATCH (po)-[:ORDERED_FROM]->(sup:Supplier)
                        OPTIONAL MATCH (w)-[:HAS_INVENTORY]->(inv:Inventory {isShortage: true})-[:BELONGS_TO]->(p:Product)
                        RETURN w.name AS whName,
                               collect(DISTINCT {po: po.poCode, poId: po.entityId, delayed: po.isDelayed, delayDays: po.delayDays, supplier: sup.supplierCode, supplierId: sup.entityId})[0..5] AS incomingPOs,
                               count(DISTINCT inv) AS shortageSlots,
                               collect(DISTINCT p.entityId)[0..5] AS shortageProductIds
                        """,
                        wid=eid,
                    )
                ]
                for row in rows:
                    for idx, po_info in enumerate(row.get("incomingPOs") or [], start=1):
                        if not po_info.get("poId"):
                            continue
                        extra_paths.append(
                            GraphPathRecord(
                                path_id=f"path-wh-{eid.split(':')[-1]}-{idx}",
                                summary=(
                                    f"{po_info['supplier']} -[:ORDERED_FROM|HAS_DELAY]- {po_info['po']} "
                                    f"(delayed={po_info['delayed']}) -[:DELIVERS_TO]-> {row['whName']}"
                                ),
                                hops=[
                                    GraphPathHop(
                                        from_entity_id=str(po_info["poId"]),
                                        from_labels=["PurchaseOrder"],
                                        from_name=str(po_info["po"]),
                                        from_origin="synthetic",
                                        relationship_type="DELIVERS_TO",
                                        relationship_props={"isDelayed": po_info["delayed"]},
                                        to_entity_id=eid,
                                        to_labels=["Warehouse"],
                                        to_name=str(row["whName"]),
                                        to_origin="synthetic",
                                    )
                                ],
                                data_origins=["synthetic"],
                                temporal_window="2018-01..2018-02 (synthetic scenario)",
                                is_synthetic_scenario=True,
                            )
                        )

            elif "Product" in labels:
                row = sess.run(
                    """
                    MATCH (p:Product {entityId: $pid})
                    OPTIONAL MATCH (sup:Supplier)-[:SUPPLIES]->(p)
                    OPTIONAL MATCH (p)-[:STORED_AT]->(w:Warehouse)
                    OPTIONAL MATCH (o:Order)-[ci:CONTAINS]->(p)
                    RETURN p.entityId AS pid, p.name AS pname,
                           collect(DISTINCT {id: sup.entityId, code: sup.supplierCode, name: sup.name}) AS suppliers,
                           collect(DISTINCT {id: w.entityId, name: w.name}) AS warehouses,
                           min(o.orderDate) AS minOrderDate, max(o.orderDate) AS maxOrderDate,
                           count(DISTINCT o) AS historicalOrders,
                           count(DISTINCT CASE WHEN o.orderDate >= $win_start AND o.orderDate <= $win_end THEN o END) AS overlapOrders,
                           round(coalesce(sum(ci.sales), 0), 2) AS historicalSalesUsd
                    """,
                    pid=eid,
                    win_start=win_start,
                    win_end=win_end,
                ).single()
                if row:
                    rdict = dict(row)
                    extra_product_summaries.append(rdict)
                    for sup in (rdict.get("suppliers") or [])[:2]:
                        if sup.get("id"):
                            extra_paths.append(
                                GraphPathRecord(
                                    path_id=f"path-prod-{eid.split(':')[-1]}",
                                    summary=(
                                        f"{sup['code']} ({sup['name']}) -[:SUPPLIES]-> {rdict['pname']} ({eid}); "
                                        f"historical orders={rdict['historicalOrders']} ({str(rdict['minOrderDate'])[:10]}..{str(rdict['maxOrderDate'])[:10]})"
                                    ),
                                    hops=[
                                        GraphPathHop(
                                            from_entity_id=str(sup["id"]),
                                            from_labels=["Supplier"],
                                            from_name=str(sup["name"]),
                                            from_origin="synthetic",
                                            relationship_type="SUPPLIES",
                                            relationship_props={},
                                            to_entity_id=eid,
                                            to_labels=["Product"],
                                            to_name=str(rdict["pname"]),
                                            to_origin="public_open_dataset",
                                        )
                                    ],
                                    data_origins=["synthetic", "public_open_dataset"],
                                    temporal_window=f"{str(rdict['minOrderDate'])[:10]}..{str(rdict['maxOrderDate'])[:10]} (historical)",
                                    is_synthetic_scenario=True,
                                    is_historical_baseline=True,
                                )
                            )

            elif include_demonstration and "DemoEntity" in labels:
                rows = [
                    dict(r)
                    for r in sess.run(
                        """
                        MATCH (a:DemoEntity {entityId: $did})-[r:DEMO_REL]->(b:DemoEntity)
                        RETURN a.entityId AS fromId, a.label AS fromLabel,
                               r.relationship AS relLabel,
                               b.entityId AS toId, b.label AS toLabel
                        LIMIT 10
                        """,
                        did=eid,
                    )
                ]
                for idx, r in enumerate(rows, start=1):
                    demo_records.append(r)
                    extra_paths.append(
                        GraphPathRecord(
                            path_id=f"path-demo-{eid.split(':')[-1]}-{idx}",
                            summary=f"[DEMONSTRATION] {r['fromLabel']} -[{r['relLabel']}]-> {r['toLabel']}",
                            hops=[
                                GraphPathHop(
                                    from_entity_id=str(r["fromId"]),
                                    from_labels=["DemoEntity"],
                                    from_name=str(r["fromLabel"]),
                                    from_origin="demonstration",
                                    relationship_type="DEMO_REL",
                                    relationship_props={"relationship": r["relLabel"]},
                                    to_entity_id=str(r["toId"]),
                                    to_labels=["DemoEntity"],
                                    to_name=str(r["toLabel"]),
                                    to_origin="demonstration",
                                )
                            ],
                            data_origins=["demonstration"],
                            temporal_window="demonstration (non-production)",
                            is_demonstration=True,
                        )
                    )

    return extra_paths, {"products_detail": extra_product_summaries}, {"demo_links": demo_records}


def run_hybrid_retrieval(
    client: Neo4jClient,
    request: GraphRAGRetrieveRequest,
    settings: Settings | None = None,
    embedding_provider: EmbeddingProvider | None = None,
) -> GraphRAGRetrievalResult:
    """Execute hybrid retrieval (Vector + Fulltext + Multi-hop Neo4j Traversal + Temporal Filter)."""
    cfg = settings or get_settings()
    embedder = embedding_provider or build_embedding_provider(
        provider_name=cfg.graphrag_embedding_provider,
        dimensions=cfg.graphrag_embedding_dimensions,
        model_name=cfg.graphrag_embedding_model,
        gemini_api_key=cfg.gemini_api_key,
    )

    allowed_origins: list[str] | None = request.data_origins
    if allowed_origins is None:
        if not request.include_demonstration:
            allowed_origins = [
                "enterprise_document",
                "synthetic",
                "public_open_dataset",
                "external_research",
            ]
    elif not request.include_demonstration:
        allowed_origins = [o for o in allowed_origins if o != "demonstration"]

    query_vec = embedder.embed_query(request.query)

    channels_used: list[str] = []
    vector_rows: list[dict[str, Any]] = []
    keyword_rows: list[dict[str, Any]] = []

    try:
        vector_rows = vector_search_chunks_neo4j(
            client,
            query_vector=query_vec,
            top_k=max(request.top_k * 2, 10),
            allowed_origins=allowed_origins,
        )
        if vector_rows:
            channels_used.append("neo4j_vector")
    except Exception:
        vector_rows = []

    try:
        keyword_rows = fulltext_search_chunks_neo4j(
            client,
            query_text=request.query,
            top_k=max(request.top_k * 2, 10),
            allowed_origins=allowed_origins,
        )
        if keyword_rows:
            channels_used.append("neo4j_fulltext_chunk")
    except Exception:
        keyword_rows = []

    explicit_anchors = _lookup_explicit_anchor_entities(
        client,
        request.query,
        include_demonstration=request.include_demonstration,
    )
    ft_entities: list[dict[str, Any]] = []
    try:
        ft_entities = fulltext_search_entities_neo4j(
            client,
            query_text=request.query,
            limit=10,
            include_demonstration=request.include_demonstration,
        )
    except Exception:
        ft_entities = []

    query_tokens = _substantive_query_tokens(request.query)
    filtered_ft_entities: list[dict[str, Any]] = []
    for row in ft_entities:
        row_text = f"{row.get('displayName') or ''} {row.get('code') or ''} {row.get('entityId') or ''}"
        row_tokens = {t.lower() for t in re.findall(r"[A-Za-z0-9]{3,}", row_text)}
        if query_tokens and (query_tokens & row_tokens):
            filtered_ft_entities.append(row)

    anchors_by_id: dict[str, dict[str, Any]] = {}
    for row in explicit_anchors + filtered_ft_entities:
        eid = str(row["entityId"])
        if eid not in anchors_by_id:
            anchors_by_id[eid] = row

    anchor_ids = set(anchors_by_id.keys())
    graph_mention_rows = _chunks_for_entities_neo4j(
        client,
        entity_ids=list(anchor_ids),
        allowed_origins=allowed_origins,
        limit=max(request.top_k * 2, 8),
    )
    if graph_mention_rows:
        channels_used.append("neo4j_graph_mention")

    fused_chunks = fuse_chunk_candidates_rrf(
        vector_rows=vector_rows,
        keyword_rows=keyword_rows,
        graph_mention_rows=graph_mention_rows,
        anchor_entity_ids=anchor_ids,
        top_k=request.top_k,
    )
    fused_chunks = [ch for ch in fused_chunks if _chunk_passes_relevance_gate(query_tokens, ch)]
    for idx, ch in enumerate(fused_chunks, start=1):
        ch.rank = idx

    # Also harvest top linked entities from strongly corroborated chunks to enrich graph traversal
    for ch in fused_chunks:
        corroborated = (
            ch.keyword_score > 0.0
            or "graph_mention" in ch.retrieval_channels
            or ch.vector_score >= 0.62
        )
        if not corroborated:
            continue
        for lk in ch.linked_entities:
            eid = str(lk.get("entity_id") or "")
            origin = str(lk.get("data_origin") or "")
            if not eid or eid in anchors_by_id:
                continue
            if not request.include_demonstration and origin == "demonstration":
                continue
            if float(lk.get("confidence") or 0.0) >= 0.85:
                anchors_by_id[eid] = {
                    "entityId": eid,
                    "labels": lk.get("labels") or [],
                    "displayName": lk.get("display_name") or eid,
                    "dataOrigin": origin,
                    "score": float(lk.get("confidence") or 0.85),
                }

    ordered_anchors = sorted(
        anchors_by_id.values(),
        key=lambda a: (-(float(a.get("score") or 0.0)), str(a.get("entityId") or "")),
    )

    custom_start = _normalize_date_bound(request.order_start_date, end_of_day=False)
    custom_end = _normalize_date_bound(request.order_end_date, end_of_day=True)
    as_of_bound = _normalize_date_bound(request.as_of_date, end_of_day=False) or "2026-11-12T00:00:00"

    supplier_anchors = [a for a in ordered_anchors if "Supplier" in (a.get("labels") or [])]
    synthetic_evidence: dict[str, Any] = {}
    historical_evidence: dict[str, Any] = {}
    graph_paths: list[GraphPathRecord] = []
    covered_ids: set[str] = set()

    if supplier_anchors:
        channels_used.append("neo4j_multi_hop_traversal")
        primary_sup_id = str(supplier_anchors[0]["entityId"])
        covered_ids.add(primary_sup_id)
        synthetic_evidence, historical_evidence, sup_paths = _traverse_supplier_anchor(
            client=client,
            supplier_id=primary_sup_id,
            temporal_mode=request.temporal_mode,
            as_of_bound=as_of_bound,
            custom_start=custom_start,
            custom_end=custom_end,
        )
        graph_paths.extend(sup_paths)
        for p in synthetic_evidence.get("supplied_products") or []:
            if p.get("entityId"):
                covered_ids.add(str(p["entityId"]))
        for w in synthetic_evidence.get("holding_warehouses") or []:
            if w.get("entityId"):
                covered_ids.add(str(w["entityId"]))

    win_start = (
        custom_start
        or synthetic_evidence.get("scenario_window", {}).get("start")
        or "2018-01-05T09:00:00"
    )
    win_end = (
        custom_end
        or synthetic_evidence.get("scenario_window", {}).get("end")
        or "2018-02-11T17:00:00"
    )

    extra_paths, extra_prod, extra_demo = _traverse_secondary_anchors(
        client=client,
        anchors=ordered_anchors,
        covered_ids=covered_ids,
        temporal_mode=request.temporal_mode,
        win_start=win_start,
        win_end=win_end,
        include_demonstration=request.include_demonstration,
    )
    if extra_paths and "neo4j_multi_hop_traversal" not in channels_used:
        channels_used.append("neo4j_multi_hop_traversal")
    graph_paths.extend(extra_paths)

    if extra_prod.get("products_detail") and not historical_evidence:
        p0 = extra_prod["products_detail"][0]
        historical_evidence = {
            "data_origin": "public_open_dataset",
            "temporal_mode": request.temporal_mode,
            "product_details": extra_prod["products_detail"],
            "overlapping_window_orders_count": sum(int(x.get("overlapOrders") or 0) for x in extra_prod["products_detail"]),
            "current_active_orders_count": 0 if as_of_bound > "2018-02-01" else sum(int(x.get("overlapOrders") or 0) for x in extra_prod["products_detail"]),
            "excluded_pre_scenario_orders_count": (
                sum(int(x.get("historicalOrders") or 0) for x in extra_prod["products_detail"])
                - sum(int(x.get("overlapOrders") or 0) for x in extra_prod["products_detail"])
            ),
            "historical_all_years_orders_total": sum(int(x.get("historicalOrders") or 0) for x in extra_prod["products_detail"]),
            "historical_all_years_sales_usd": round(sum(float(x.get("historicalSalesUsd") or 0.0) for x in extra_prod["products_detail"]), 2),
            "historical_order_date_range": {
                "min": p0.get("minOrderDate"),
                "max": p0.get("maxOrderDate"),
            },
        }

    excluded_hist = int(historical_evidence.get("excluded_pre_scenario_orders_count") or 0)
    overlap_cnt = int(historical_evidence.get("overlapping_window_orders_count") or 0)
    current_cnt = int(historical_evidence.get("current_active_orders_count") or 0)
    min_hist = (historical_evidence.get("historical_order_date_range") or {}).get("min")
    max_hist = (historical_evidence.get("historical_order_date_range") or {}).get("max")

    temporal_explanation = (
        f"Temporal filter ({request.temporal_mode}, as_of_date={request.as_of_date}) compared scenario window "
        f"[{win_start[:10]}..{win_end[:10]}] against DataCo Order history"
        + (f" [{str(min_hist)[:10]}..{str(max_hist)[:10]}]" if min_hist and max_hist else "")
        + f": {current_cnt} active real-world orders, {overlap_cnt} window-overlapping historical orders, "
        f"and {excluded_hist} pre-scenario historical orders excluded from current causal impact."
    )

    demo_chunks = [ch for ch in fused_chunks if ch.data_origin == "demonstration"]
    enterprise_chunks = [ch for ch in fused_chunks if ch.data_origin != "demonstration"]

    demo_block: dict[str, Any] = {
        "included": request.include_demonstration,
        "chunk_count": len(demo_chunks),
        "chunks": [ch.chunk_id for ch in demo_chunks],
        "graph_links": extra_demo.get("demo_links") or [],
        "isolation_note": (
            "Demonstration entities/documents are strictly separated from DataCo public and synthetic procurement evidence."
            if request.include_demonstration
            else "Excluded by default (include_demonstration=false) to prevent mock entity contamination."
        ),
    }

    origin_evidence = OriginSeparatedEvidence(
        public_historical_dataco=historical_evidence,
        synthetic_scenario=synthetic_evidence,
        enterprise_documents={
            "chunk_count": len(enterprise_chunks),
            "documents_matched": sorted({ch.document_entity_id for ch in enterprise_chunks}),
        },
        demonstration=demo_block,
    )

    temporal_summary = TemporalFilterSummary(
        mode=request.temporal_mode,  # type: ignore[arg-type]
        as_of_date=request.as_of_date,
        scenario_window_start=win_start,
        scenario_window_end=win_end,
        order_start_date=custom_start,
        order_end_date=custom_end,
        historical_orders_excluded_from_active_count=excluded_hist,
        overlapping_window_orders_count=overlap_cnt,
        current_real_world_orders_count=current_cnt,
        temporal_guardrail_applied=True,
        explanation=temporal_explanation,
    )

    return GraphRAGRetrievalResult(
        query=request.query,
        retrieval_channels_used=channels_used,
        matched_entities=ordered_anchors[:10],
        chunks=fused_chunks,
        graph_paths=graph_paths,
        temporal_filter=temporal_summary,
        origin_evidence=origin_evidence,
    )
