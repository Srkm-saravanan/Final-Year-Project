from __future__ import annotations

from typing import Any

from cortex_intelligence.graph.neo4j_client import Neo4jClient


def get_graph_statistics(client: Neo4jClient) -> dict[str, Any]:
    """Read-only parameterized statistics across labels, relationship types, origins, constraints, and indexes."""
    with client.session() as sess:
        total_nodes = int(sess.run("MATCH (n:CortexEntity) RETURN count(n) AS c").single()["c"])
        total_rels = int(sess.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"])

        label_rows = sess.run(
            """
            MATCH (n:CortexEntity)
            UNWIND labels(n) AS lbl
            WITH lbl WHERE lbl <> 'CortexEntity'
            RETURN lbl AS label, count(*) AS count
            ORDER BY count DESC, label ASC
            """
        )
        nodes_by_label = {r["label"]: int(r["count"]) for r in label_rows}

        rel_rows = sess.run(
            """
            MATCH ()-[r]->()
            RETURN type(r) AS relType, count(*) AS count
            ORDER BY count DESC, relType ASC
            """
        )
        relationships_by_type = {r["relType"]: int(r["count"]) for r in rel_rows}

        origin_rows = sess.run(
            """
            MATCH (n:CortexEntity)
            RETURN coalesce(n.dataOrigin, 'unknown') AS dataOrigin, count(n) AS count
            ORDER BY count DESC
            """
        )
        nodes_by_origin = {r["dataOrigin"]: int(r["count"]) for r in origin_rows}

        constraints = [
            {
                "name": r["name"],
                "type": r["type"],
                "labelsOrTypes": r["labelsOrTypes"],
                "properties": r["properties"],
            }
            for r in sess.run("SHOW CONSTRAINTS")
        ]
        indexes = [
            {
                "name": r["name"],
                "state": r["state"],
                "type": r["type"],
                "labelsOrTypes": r["labelsOrTypes"],
                "properties": r["properties"],
            }
            for r in sess.run("SHOW INDEXES")
            if r["type"] != "LOOKUP"
        ]

    return {
        "total_nodes": total_nodes,
        "total_relationships": total_rels,
        "nodes_by_label": nodes_by_label,
        "relationships_by_type": relationships_by_type,
        "nodes_by_data_origin": nodes_by_origin,
        "constraints_count": len(constraints),
        "indexes_count": len(indexes),
        "constraints": constraints,
        "indexes": indexes,
    }


def get_entity_by_id(client: Neo4jClient, entity_id: str) -> dict[str, Any] | None:
    """Safely look up a single canonical entity by its unique entityId."""
    with client.session() as sess:
        rec = sess.run(
            """
            MATCH (n:CortexEntity {entityId: $entity_id})
            OPTIONAL MATCH (n)-[outR]->()
            OPTIONAL MATCH ()-[inR]->(n)
            RETURN labels(n) AS labels,
                   properties(n) AS properties,
                   count(DISTINCT outR) AS outgoingCount,
                   count(DISTINCT inR) AS incomingCount
            """,
            entity_id=entity_id,
        ).single()

    if rec is None:
        return None

    labels = [lbl for lbl in rec["labels"] if lbl != "CortexEntity"]
    props = dict(rec["properties"])
    return {
        "entity_id": props.get("entityId"),
        "labels": labels,
        "properties": props,
        "provenance": {
            "source_dataset": props.get("sourceDataset"),
            "source_record_id": props.get("sourceRecordId"),
            "data_origin": props.get("dataOrigin"),
            "ingestion_job_id": props.get("ingestionJobId"),
        },
        "degree": {
            "outgoing": int(rec["outgoingCount"]),
            "incoming": int(rec["incomingCount"]),
            "total": int(rec["outgoingCount"]) + int(rec["incomingCount"]),
        },
    }


def get_entity_relationships(
    client: Neo4jClient,
    entity_id: str,
    limit: int = 50,
    direction: str = "both",
) -> dict[str, Any] | None:
    """Safely inspect bounded outgoing and/or incoming relationships for an entity."""
    safe_limit = max(1, min(limit, 200))
    with client.session() as sess:
        exists_rec = sess.run(
            "MATCH (n:CortexEntity {entityId: $entity_id}) RETURN n.entityId AS id, labels(n) AS labels",
            entity_id=entity_id,
        ).single()
        if exists_rec is None:
            return None

        relationships: list[dict[str, Any]] = []
        if direction in ("both", "outgoing"):
            out_rows = sess.run(
                """
                MATCH (n:CortexEntity {entityId: $entity_id})-[r]->(m:CortexEntity)
                RETURN 'outgoing' AS direction,
                       type(r) AS relType,
                       properties(r) AS relProps,
                       m.entityId AS targetEntityId,
                       [l IN labels(m) WHERE l <> 'CortexEntity'] AS targetLabels,
                       coalesce(m.name, m.label, m.title, m.poCode, m.orderCode, m.entityId) AS targetDisplayName,
                       m.dataOrigin AS targetDataOrigin
                LIMIT $limit
                """,
                entity_id=entity_id,
                limit=safe_limit,
            )
            for r in out_rows:
                relationships.append(
                    {
                        "direction": r["direction"],
                        "type": r["relType"],
                        "properties": dict(r["relProps"]),
                        "counterpart": {
                            "entity_id": r["targetEntityId"],
                            "labels": list(r["targetLabels"]),
                            "display_name": r["targetDisplayName"],
                            "data_origin": r["targetDataOrigin"],
                        },
                    }
                )

        if direction in ("both", "incoming"):
            in_rows = sess.run(
                """
                MATCH (m:CortexEntity)-[r]->(n:CortexEntity {entityId: $entity_id})
                RETURN 'incoming' AS direction,
                       type(r) AS relType,
                       properties(r) AS relProps,
                       m.entityId AS sourceEntityId,
                       [l IN labels(m) WHERE l <> 'CortexEntity'] AS sourceLabels,
                       coalesce(m.name, m.label, m.title, m.poCode, m.orderCode, m.entityId) AS sourceDisplayName,
                       m.dataOrigin AS sourceDataOrigin
                LIMIT $limit
                """,
                entity_id=entity_id,
                limit=safe_limit,
            )
            for r in in_rows:
                relationships.append(
                    {
                        "direction": r["direction"],
                        "type": r["relType"],
                        "properties": dict(r["relProps"]),
                        "counterpart": {
                            "entity_id": r["sourceEntityId"],
                            "labels": list(r["sourceLabels"]),
                            "display_name": r["sourceDisplayName"],
                            "data_origin": r["sourceDataOrigin"],
                        },
                    }
                )

    return {
        "entity_id": entity_id,
        "labels": [l for l in exists_rec["labels"] if l != "CortexEntity"],
        "returned_count": len(relationships),
        "limit": safe_limit,
        "relationships": relationships,
    }

