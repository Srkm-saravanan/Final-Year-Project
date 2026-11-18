from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from cortex_intelligence.acquisition.registry import (
    DATACO_API_URL,
    DATACO_EXPECTED_FILES,
    build_default_registry,
    save_registry,
    verify_file_integrity,
)
from cortex_intelligence.config import Settings, ensure_directories, get_settings


def _download_file(url: str, target_path: Path) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "CORTEX-PhaseD1-Acquisition/1.0 (Academic Research)"},
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        tmp_path = target_path.with_suffix(target_path.suffix + ".part")
        with tmp_path.open("wb") as out:
            while chunk := resp.read(1024 * 1024):
                out.write(chunk)
        tmp_path.replace(target_path)


def fetch_mendeley_manifest(api_url: str = DATACO_API_URL) -> dict[str, object]:
    req = urllib.request.Request(
        api_url,
        headers={"User-Agent": "CORTEX-PhaseD1-Acquisition/1.0 (Academic Research)"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ensure_dataco_dataset(
    settings: Settings | None = None,
    force_download: bool = False,
) -> dict[str, object]:
    cfg = settings or get_settings()
    ensure_directories(cfg)
    dataco_dir = cfg.raw_dir / "dataco"
    results: dict[str, object] = {}

    for filename, spec in DATACO_EXPECTED_FILES.items():
        target = dataco_dir / filename
        check = verify_file_integrity(
            target,
            expected_sha256=str(spec["sha256"]),
            expected_size=int(spec["size"]),
        )
        if force_download or not check.get("valid"):
            _download_file(str(spec["download_url"]), target)
            check = verify_file_integrity(
                target,
                expected_sha256=str(spec["sha256"]),
                expected_size=int(spec["size"]),
            )
            if not check.get("valid"):
                raise RuntimeError(
                    f"Integrity verification failed for {filename}: {check.get('reason')}"
                )
        results[filename] = check

    entries = build_default_registry(cfg)
    reg_file = save_registry(entries, cfg)
    return {
        "registry_path": str(reg_file),
        "files": results,
    }

