from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from neo4j import Driver, GraphDatabase, Session
from neo4j.exceptions import Neo4jError, ServiceUnavailable

from cortex_intelligence.config import Settings, get_settings
from cortex_intelligence.graph.schema import CONSTRAINT_STATEMENTS, INDEX_STATEMENTS


class Neo4jClient:
    """Managed Neo4j driver wrapper configured strictly from environment variables."""

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._driver: Driver | None = None

    def connect(self) -> Driver:
        if self._driver is None:
            if not self.settings.neo4j_password:
                raise RuntimeError("NEO4J_PASSWORD environment variable is required to connect to Neo4j.")
            self._driver = GraphDatabase.driver(
                self.settings.neo4j_uri,
                auth=(self.settings.neo4j_username, self.settings.neo4j_password),
                max_connection_lifetime=3600,
                connection_timeout=15.0,
            )
        return self._driver

    def close(self) -> None:
        if self._driver is not None:
            self._driver.close()
            self._driver = None

    @contextmanager
    def session(self) -> Iterator[Session]:
        driver = self.connect()
        sess = driver.session(database=self.settings.neo4j_database)
        try:
            yield sess
        finally:
            sess.close()

    def verify_connectivity(self) -> dict[str, object]:
        try:
            driver = self.connect()
            driver.verify_connectivity()
            with self.session() as sess:
                rec = sess.run("RETURN 1 AS ok").single()
            return {"connected": bool(rec and rec["ok"] == 1), "database": self.settings.neo4j_database}
        except (ServiceUnavailable, Neo4jError, RuntimeError) as exc:
            return {"connected": False, "error": type(exc).__name__}

    def ensure_schema(self) -> dict[str, int]:
        applied_constraints = 0
        applied_indexes = 0
        with self.session() as sess:
            for stmt in CONSTRAINT_STATEMENTS:
                sess.run(stmt).consume()
                applied_constraints += 1
            for stmt in INDEX_STATEMENTS:
                sess.run(stmt).consume()
                applied_indexes += 1
        return {"constraints_applied": applied_constraints, "indexes_applied": applied_indexes}

