from __future__ import annotations

import json
from pathlib import Path

from cortex_intelligence.models import (
    DataOrigin,
    DemonstrationNodeEntity,
    DemonstrationRel,
)


def load_demonstration_graph(
    mock_json_path: Path,
    ingestion_job_id: str,
) -> tuple[list[DemonstrationNodeEntity], list[DemonstrationRel]]:
    """Dataset C: Load CORTEX mock-data.json knowledge graph strictly tagged data_origin='demonstration'."""
    if not mock_json_path.exists():
        return [], []

    raw = json.loads(mock_json_path.read_text(encoding="utf-8"))
    kg = raw.get("knowledgeGraph") or {}
    raw_nodes = kg.get("nodes") or []
    raw_edges = kg.get("edges") or []

    nodes: list[DemonstrationNodeEntity] = []
    id_map: dict[str, str] = {}
    for n in raw_nodes:
        orig_id = str(n.get("id") or "").strip()
        if not orig_id:
            continue
        entity_id = f"demo:node:{orig_id}"
        id_map[orig_id] = entity_id
        nodes.append(
            DemonstrationNodeEntity(
                entity_id=entity_id,
                original_id=orig_id,
                label=str(n.get("label") or orig_id).strip(),
                node_type=str(n.get("type") or "Entity").strip(),
                category=str(n.get("category") or "Demonstration").strip(),
                description=n.get("description"),
                source_dataset="mock-data.json",
                source_record_id=f"knowledgeGraph.nodes.{orig_id}",
                data_origin=DataOrigin.DEMONSTRATION,
                ingestion_job_id=ingestion_job_id,
            )
        )

    rels: list[DemonstrationRel] = []
    for e in raw_edges:
        edge_id = str(e.get("id") or "").strip()
        src = str(e.get("source") or "").strip()
        tgt = str(e.get("target") or "").strip()
        rel_name = str(e.get("relationship") or "RELATED_TO").strip()
        if src in id_map and tgt in id_map:
            rels.append(
                DemonstrationRel(
                    rel_id=f"demo:edge:{edge_id or f'{src}->{tgt}'}",
                    source_entity_id=id_map[src],
                    target_entity_id=id_map[tgt],
                    relationship=rel_name,
                    source_dataset="mock-data.json",
                    source_record_id=f"knowledgeGraph.edges.{edge_id or f'{src}->{tgt}'}",
                    data_origin=DataOrigin.DEMONSTRATION,
                    ingestion_job_id=ingestion_job_id,
                )
            )

    return nodes, rels

