from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from cortex_intelligence.config import Settings, ensure_directories, get_settings


@pytest.fixture()
def isolated_settings(tmp_path: Path) -> Settings:
    """Create a temporary data_dir while keeping real Neo4j & API credentials."""
    base = get_settings()
    tmp_data = tmp_path / "data"
    settings = Settings(
        project_root=base.project_root,
        data_dir=tmp_data,
        NEO4J_URI=base.neo4j_uri,
        NEO4J_USERNAME=base.neo4j_username,
        NEO4J_PASSWORD=base.neo4j_password,
        NEO4J_DATABASE=base.neo4j_database,
        INTELLIGENCE_API_KEY="test-internal-service-key",
        SYNTHETIC_RANDOM_SEED=20261112,
    )
    ensure_directories(settings)
    sample_src = base.samples_dir / "dataco_sample.csv"
    if sample_src.exists():
        shutil.copy2(sample_src, settings.samples_dir / "dataco_sample.csv")
    return settings

