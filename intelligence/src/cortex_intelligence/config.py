from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_project_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if (parent / "package.json").exists() and (parent / "mock-data.json").exists():
            return parent
    return Path.cwd()


PROJECT_ROOT = _find_project_root()
load_dotenv(PROJECT_ROOT / ".env", override=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    project_root: Path = Field(default=PROJECT_ROOT)
    data_dir: Path = Field(default=PROJECT_ROOT / "data")

    neo4j_uri: str = Field(default="bolt://localhost:7687", alias="NEO4J_URI")
    neo4j_username: str = Field(default="neo4j", alias="NEO4J_USERNAME")
    neo4j_password: str = Field(default="", alias="NEO4J_PASSWORD")
    neo4j_database: str = Field(default="neo4j", alias="NEO4J_DATABASE")

    intelligence_host: str = Field(default="127.0.0.1", alias="INTELLIGENCE_HOST")
    intelligence_port: int = Field(default=8001, alias="INTELLIGENCE_PORT")
    intelligence_api_key: str = Field(default="", alias="INTELLIGENCE_API_KEY")

    synthetic_random_seed: int = Field(default=20261112, alias="SYNTHETIC_RANDOM_SEED")

    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    graphrag_embedding_provider: str = Field(default="local", alias="GRAPHRAG_EMBEDDING_PROVIDER")
    graphrag_embedding_model: str = Field(
        default="cortex-local-semantic-512-v1",
        alias="GRAPHRAG_EMBEDDING_MODEL",
    )
    graphrag_embedding_dimensions: int = Field(default=512, alias="GRAPHRAG_EMBEDDING_DIMENSIONS")
    graphrag_chunk_size: int = Field(default=900, alias="GRAPHRAG_CHUNK_SIZE")
    graphrag_chunk_overlap: int = Field(default=150, alias="GRAPHRAG_CHUNK_OVERLAP")

    # Local Ollama LLM Configuration (Phase 1)
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="cortex-qwen:latest", alias="OLLAMA_MODEL")
    ollama_context_size: int = Field(default=4096, alias="OLLAMA_CONTEXT_SIZE")
    ollama_temperature: float = Field(default=0.2, alias="OLLAMA_TEMPERATURE")
    ollama_timeout_seconds: float = Field(default=60.0, alias="OLLAMA_TIMEOUT_SECONDS")

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def processed_dir(self) -> Path:
        return self.data_dir / "processed"

    @property
    def registry_dir(self) -> Path:
        return self.data_dir / "registry"

    @property
    def samples_dir(self) -> Path:
        return self.data_dir / "samples"

    @property
    def jobs_dir(self) -> Path:
        return self.processed_dir / "jobs"

    @property
    def reports_dir(self) -> Path:
        return self.processed_dir / "reports"

    @property
    def documents_dir(self) -> Path:
        return self.data_dir / "documents"

    @property
    def graphrag_dir(self) -> Path:
        return self.processed_dir / "graphrag"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def ensure_directories(settings: Settings | None = None) -> None:
    cfg = settings or get_settings()
    for path in (
        cfg.data_dir,
        cfg.raw_dir,
        cfg.raw_dir / "dataco",
        cfg.processed_dir,
        cfg.processed_dir / "dataco",
        cfg.processed_dir / "synthetic_procurement",
        cfg.processed_dir / "demonstration",
        cfg.processed_dir / "graphrag",
        cfg.documents_dir,
        cfg.registry_dir,
        cfg.samples_dir,
        cfg.jobs_dir,
        cfg.reports_dir,
    ):
        os.makedirs(path, exist_ok=True)

