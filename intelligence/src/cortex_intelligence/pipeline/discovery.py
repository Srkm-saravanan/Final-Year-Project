from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from cortex_intelligence.acquisition.registry import load_registry
from cortex_intelligence.config import Settings, get_settings


@dataclass(frozen=True)
class DiscoveredSource:
    dataset_id: str
    path: Path
    exists: bool
    data_origin: str
    role: str


def discover_sources(
    settings: Settings | None = None,
    override_dataco_csv: Path | None = None,
) -> list[DiscoveredSource]:
    """Stage 1: Discover local datasets from registry and configured paths."""
    cfg = settings or get_settings()
    entries = load_registry(cfg)
    discovered: list[DiscoveredSource] = []

    if override_dataco_csv is not None:
        discovered.append(
            DiscoveredSource(
                dataset_id="dataco-supply-chain-structured",
                path=override_dataco_csv,
                exists=override_dataco_csv.exists(),
                data_origin="public_open_dataset",
                role="primary_structured",
            )
        )
    else:
        for entry in entries:
            if entry.local_relative_path:
                resolved = cfg.project_root / entry.local_relative_path
                discovered.append(
                    DiscoveredSource(
                        dataset_id=entry.dataset_id,
                        path=resolved,
                        exists=resolved.exists(),
                        data_origin=entry.data_origin.value,
                        role=entry.processing_status,
                    )
                )
    return discovered

