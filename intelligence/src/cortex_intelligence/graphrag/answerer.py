from __future__ import annotations

from cortex_intelligence.graphrag.models import (
    CitationRecord,
    GraphRAGAnswerResponse,
    GraphRAGQueryRequest,
    GraphRAGRetrievalResult,
)


def synthesize_grounded_answer(
    request: GraphRAGQueryRequest,
    retrieval: GraphRAGRetrievalResult,
) -> GraphRAGAnswerResponse:
    """Synthesize a strictly grounded answer from retrieved chunks, graph paths, and temporal evidence."""
    syn = retrieval.origin_evidence.synthetic_scenario
    hist = retrieval.origin_evidence.public_historical_dataco
    demo = retrieval.origin_evidence.demonstration
    chunks = retrieval.chunks
    paths = retrieval.graph_paths

    has_graph_evidence = bool(syn or hist or paths or (demo.get("graph_links")))
    has_chunk_evidence = bool(chunks)

    if not has_graph_evidence and not has_chunk_evidence:
        return GraphRAGAnswerResponse(
            query=request.query,
            answer_markdown=(
                "## Insufficient Grounded Evidence\n\n"
                "No relevant document chunks or matching Neo4j knowledge-graph entities were found "
                f"for query: `{request.query}`.\n\n"
                "- **Temporal Filter Applied:** "
                f"{retrieval.temporal_filter.explanation}\n"
                "- **Action:** Ingest relevant source documents or specify a known supplier, warehouse, "
                "product, or purchase order identifier (`SYN-SUP-*`, `SYN-WH-*`, `SYN-PO-*`, `dataco:prod:*`)."
            ),
            insufficient_evidence=True,
            grounded_claims_count=0,
            citations=[],
            graph_paths=[],
            temporal_filter=retrieval.temporal_filter,
            origin_evidence=retrieval.origin_evidence,
            retrieval=retrieval if request.include_retrieval_debug else None,
        )

    citations: list[CitationRecord] = []
    sections: list[str] = []
    claims_count = 0

    # Build Document Citations [C1..Ck]
    chunk_citation_labels: dict[str, str] = {}
    for idx, ch in enumerate(chunks, start=1):
        cid = f"C{idx}"
        chunk_citation_labels[ch.chunk_id] = cid
        top_conf = max((float(lk.get("confidence") or 0.0) for lk in ch.linked_entities), default=None)
        citations.append(
            CitationRecord(
                citation_id=cid,
                source_type="document_chunk",
                data_origin=ch.data_origin,
                title=ch.document_title,
                document_entity_id=ch.document_entity_id,
                chunk_id=ch.chunk_id,
                page_or_section=ch.page_or_section,
                excerpt=ch.text_preview,
                entity_ids=[str(lk.get("entity_id")) for lk in ch.linked_entities[:8] if lk.get("entity_id")],
                confidence=round(top_conf, 3) if top_conf is not None else None,
                temporal_window=ch.document_date,
            )
        )

    # Build Graph Path Citations [G1..Gm]
    path_citation_labels: dict[str, str] = {}
    for idx, gp in enumerate(paths[:6], start=1):
        gid = f"G{idx}"
        path_citation_labels[gp.path_id] = gid
        path_entities: list[str] = []
        for hop in gp.hops:
            if hop.from_entity_id not in path_entities:
                path_entities.append(hop.from_entity_id)
            if hop.to_entity_id not in path_entities:
                path_entities.append(hop.to_entity_id)
        citations.append(
            CitationRecord(
                citation_id=gid,
                source_type="neo4j_graph_path",
                data_origin=", ".join(gp.data_origins) or "synthetic",
                title=gp.path_id,
                excerpt=gp.summary,
                entity_ids=path_entities,
                confidence=1.0,
                temporal_window=gp.temporal_window,
            )
        )

    sections.append(f"## Grounded GraphRAG Analysis\n\n**Query:** {request.query}")

    # 1. Synthetic Procurement Scenario Section
    if syn and syn.get("supplier"):
        sup = syn["supplier"]
        dest_wh_str = ", ".join(
            f"`{w['entity_id']}` ({w['name']})" for w in syn.get("delayed_po_destination_warehouses", [])
        ) or "None"
        prod_preview = ", ".join(
            f"`{p['entityId']}` ({p['name']})" for p in (syn.get("supplied_products") or [])[:6]
        )
        remaining_prods = max(0, int(syn.get("supplied_products_count") or 0) - 6)
        if remaining_prods:
            prod_preview += f", plus {remaining_prods} additional SKUs"

        po_examples = "; ".join(
            f"`{po['po_code']}` ({po['delay_days']}d delay, {po['delay_severity']}, cause: {po['delay_cause']} -> `{po['destination_warehouse_id']}`)"
            for po in (syn.get("delayed_purchase_orders") or [])[:4]
        )
        graph_refs = " ".join(f"[{gid}]" for gid in path_citation_labels.values() if gid.startswith("G"))
        claims_count += 1
        sections.append(
            "### 1. Synthetic Procurement Scenario Exposure (`dataOrigin = synthetic` — Simulated Only)\n"
            f"*Non-real-world deterministic simulation scenario (`{syn['scenario_window']['start'][:10]}` to `{syn['scenario_window']['end'][:10]}`); does not constitute real-world causal proof.* {graph_refs}\n"
            f"- **Supplier:** `{sup['entityId']}` (**{sup['name']}**, `{sup['tier']}`, market `{sup['homeMarket']}`, reliability `{sup['reliabilityScore']}`).\n"
            f"- **Delayed Purchase Orders:** **`{syn['delayed_purchase_orders_count']}`** delayed out of `{syn['total_purchase_orders']}` total POs (e.g., {po_examples}).\n"
            f"- **Exposed Warehouses:** **`{len(syn.get('delayed_po_destination_warehouses', []))}` delayed-PO destination warehouses** ({dest_wh_str}) "
            f"out of **`{syn['holding_warehouses_count']}` physical holding warehouses** storing this supplier's catalog (`STORED_AT`).\n"
            f"- **Affected Inventory Slots:** **`{syn['directly_affected_shortage_inventory_count']}` shortage inventory slots directly impacted by delayed POs** (`HAS_DELAY -> AFFECTS`), "
            f"out of **`{syn['network_shortage_inventory_count']}` total below-safety-stock slots** across all holding warehouses.\n"
            f"- **Exposed Products (`{syn['supplied_products_count']}` SKUs):** {prod_preview}."
        )

    # 2. Public Historical DataCo Section & Temporal Filtering
    if hist:
        date_range = hist.get("historical_order_date_range") or {}
        min_d = str(date_range.get("min") or "N/A")[:10]
        max_d = str(date_range.get("max") or "N/A")[:10]
        overlap_cnt = int(hist.get("overlapping_window_orders_count") or 0)
        current_cnt = int(hist.get("current_active_orders_count") or 0)
        excluded_cnt = int(hist.get("excluded_pre_scenario_orders_count") or 0)
        all_hist_orders = int(hist.get("historical_all_years_orders_total") or 0)
        all_hist_sales = float(hist.get("historical_all_years_sales_usd") or 0.0)
        all_hist_profit = float(hist.get("historical_all_years_profit_usd") or 0.0)
        claims_count += 1
        sections.append(
            "### 2. Public Historical DataCo Exposure & Temporal Guardrail (`dataOrigin = public_open_dataset`)\n"
            f"- **Temporal Filter Mode (`{retrieval.temporal_filter.mode}`, `as_of_date={retrieval.temporal_filter.as_of_date}`):** {retrieval.temporal_filter.explanation}\n"
            f"- **Currently Affected Real-World Orders:** **`{current_cnt}`** (DataCo snapshot terminates `2018-01-31`; no live `2026` customer orders exist).\n"
            f"- **Scenario-Window Co-Occurring Orders (`{retrieval.temporal_filter.scenario_window_start[:10]}..{retrieval.temporal_filter.scenario_window_end[:10]}`):** **`{overlap_cnt}`** historical DataCo orders overlap the synthetic PO calendar window.\n"
            f"- **Excluded Pre-Scenario Historical Baseline (`{min_d}..{max_d}`):** **`{excluded_cnt:,}`** historical orders "
            f"(representing `{all_hist_orders:,}` multi-year orders, `${all_hist_sales:,.2f}` historical sales, `${all_hist_profit:,.2f}` historical profit) "
            "precede the synthetic PO window and are **excluded from active causal exposure** — reported strictly as empirical SKU demand context if comparable future demand recurs."
        )

    # 3. Document Knowledge Section
    if chunks:
        claims_count += len(chunks)
        doc_lines = ["### 3. Retrieved Document Evidence (Vector + Fulltext + Graph Mention Fusion)"]
        for ch in chunks:
            cid = chunk_citation_labels[ch.chunk_id]
            linked_str = ", ".join(
                f"`{lk['entity_id']}` (conf={lk['confidence']})" for lk in ch.linked_entities[:4]
            ) or "None"
            doc_lines.append(
                f"- **[{cid}] `{ch.document_title}`** (`{ch.document_entity_id}`, `{ch.page_or_section}`, "
                f"`dataOrigin={ch.data_origin}`, `rrf={ch.rrf_score}`, `vector={ch.vector_score}`, `keyword={ch.keyword_score}`): "
                f"\"{ch.text_preview}\" — *Linked Entities:* {linked_str}"
            )
        sections.append("\n".join(doc_lines))

    # 4. Graph Paths Summary
    if paths:
        claims_count += len(paths[:6])
        path_lines = ["### 4. Multi-Hop Knowledge Graph Paths"]
        for gp in paths[:6]:
            gid = path_citation_labels.get(gp.path_id, gp.path_id)
            path_lines.append(
                f"- **[{gid}]** ({', '.join(gp.data_origins)}; `{gp.temporal_window}`): {gp.summary}"
            )
        sections.append("\n".join(path_lines))

    # 5. Demonstration Isolation Section
    if demo.get("included") and (demo.get("chunks") or demo.get("graph_links")):
        demo_links_str = "; ".join(
            f"{d['fromLabel']} -[{d['relLabel']}]-> {d['toLabel']}" for d in (demo.get("graph_links") or [])[:5]
        ) or "None"
        sections.append(
            "### 5. Isolated Demonstration Data (`dataOrigin = demonstration` — Mock Context Only)\n"
            f"- Matched Demo Chunks: `{len(demo.get('chunks') or [])}` ({', '.join(demo.get('chunks') or [])}).\n"
            f"- Matched Demo Graph Links: {demo_links_str}.\n"
            "- *Governance Guardrail:* Demonstration items are mock/illustrative records and must never be conflated with DataCo historical facts or supply simulation outputs."
        )
    else:
        sections.append(
            "### 5. Demonstration Data Isolation (`dataOrigin = demonstration`)\n"
            f"- {demo.get('isolation_note')}"
        )

    return GraphRAGAnswerResponse(
        query=request.query,
        answer_markdown="\n\n".join(sections),
        insufficient_evidence=False,
        grounded_claims_count=claims_count,
        citations=citations,
        graph_paths=paths,
        temporal_filter=retrieval.temporal_filter,
        origin_evidence=retrieval.origin_evidence,
        retrieval=retrieval if request.include_retrieval_debug else None,
    )

