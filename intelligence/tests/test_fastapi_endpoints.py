from __future__ import annotations

from fastapi.testclient import TestClient

from cortex_intelligence.api.main import create_app
from cortex_intelligence.config import Settings


class _FakeNeo4jClient:
    def __init__(self) -> None:
        self.closed = False

    def verify_connectivity(self) -> dict[str, object]:
        return {"connected": True, "database": "neo4j"}

    def close(self) -> None:
        self.closed = True


def test_fastapi_endpoints_auth_ingestion_and_graph_contracts(
    isolated_settings: Settings, monkeypatch
) -> None:
    import cortex_intelligence.api.routes.graph as graph_routes

    fake_client = _FakeNeo4jClient()

    monkeypatch.setattr(
        graph_routes,
        "get_graph_statistics",
        lambda _client: {
            "total_nodes": 120,
            "total_relationships": 240,
            "nodes_by_label": {"Supplier": 18, "Product": 30},
            "relationships_by_type": {"SUPPLIES": 30},
            "nodes_by_data_origin": {"synthetic": 18},
            "constraints_count": 14,
            "indexes_count": 6,
            "central_use_case_foundation": {"supplier_id": "syn:supplier:SYN-SUP-001"},
        },
    )
    monkeypatch.setattr(
        graph_routes,
        "get_entity_by_id",
        lambda _client, entity_id: (
            {
                "entityId": entity_id,
                "labels": ["Supplier", "CortexEntity"],
                "properties": {"entityId": entity_id, "dataOrigin": "synthetic"},
                "relationship_degree": 12,
            }
            if entity_id == "syn:supplier:SYN-SUP-001"
            else None
        ),
    )
    monkeypatch.setattr(
        graph_routes,
        "get_entity_relationships",
        lambda _client, entity_id, limit=50, direction="both": {
            "entity_id": entity_id,
            "labels": ["Supplier"],
            "returned_count": 1,
            "limit": limit,
            "relationships": [
                {
                    "direction": "outgoing",
                    "type": "SUPPLIES",
                    "properties": {"dataOrigin": "synthetic"},
                    "counterpart": {
                        "entity_id": "dataco:product:365",
                        "labels": ["Product"],
                        "display_name": "Perfect Fitness Rip Deck",
                        "data_origin": "public_open_dataset",
                    },
                }
            ],
        },
    )

    app = create_app(
        settings_override=isolated_settings,
        neo4j_client_override=fake_client,  # type: ignore[arg-type]
    )
    headers = {"X-Cortex-Service-Key": "test-internal-service-key"}

    with TestClient(app) as client:
        # Public /health must not require service key
        health = client.get("/health")
        assert health.status_code == 200
        health_data = health.json()["data"]
        assert health_data["status"] == "ok"
        assert health_data["neo4j"]["connected"] is True

        # Protected endpoints reject missing or wrong service key with 401
        unauth = client.get("/api/v1/ingestion/sources")
        assert unauth.status_code == 401
        bad_key = client.get("/api/v1/graph/statistics", headers={"X-Cortex-Service-Key": "wrong"})
        assert bad_key.status_code == 401

        # Trigger structured sample ingestion (skip_neo4j=True in API unit test)
        ingest = client.post(
            "/api/v1/ingestion/structured",
            headers=headers,
            json={"mode": "sample", "skip_neo4j": True},
        )
        assert ingest.status_code == 201
        job_data = ingest.json()["data"]
        assert job_data["status"] == "completed"
        assert job_data["cleaning_stats"]["accepted_rows"] == 30
        job_id = job_data["job_id"]

        # Fetch job status & sources
        job_resp = client.get(f"/api/v1/ingestion/jobs/{job_id}", headers=headers)
        assert job_resp.status_code == 200
        assert job_resp.json()["data"]["job_id"] == job_id

        sources_resp = client.get("/api/v1/ingestion/sources", headers=headers)
        assert sources_resp.status_code == 200
        assert sources_resp.json()["data"]["count"] >= 3
        assert len(sources_resp.json()["data"]["sources"]) >= 3

        # Graph statistics, entity lookup, 404 lookup & relationships
        stats_resp = client.get("/api/v1/graph/statistics", headers=headers)
        assert stats_resp.status_code == 200
        assert stats_resp.json()["data"]["total_nodes"] == 120

        entity_resp = client.get("/api/v1/graph/entities/syn:supplier:SYN-SUP-001", headers=headers)
        assert entity_resp.status_code == 200
        assert entity_resp.json()["data"]["entityId"] == "syn:supplier:SYN-SUP-001"

        missing_entity = client.get("/api/v1/graph/entities/does:not:exist", headers=headers)
        assert missing_entity.status_code == 404

        rel_resp = client.get(
            "/api/v1/graph/relationships/syn:supplier:SYN-SUP-001?direction=outgoing&limit=10",
            headers=headers,
        )
        assert rel_resp.status_code == 200
        assert rel_resp.json()["data"]["returned_count"] == 1

        # Arbitrary Cypher endpoint must NOT exist
        no_cypher = client.post("/api/v1/graph/cypher", headers=headers, json={"query": "MATCH (n) RETURN n"})
        assert no_cypher.status_code == 404
