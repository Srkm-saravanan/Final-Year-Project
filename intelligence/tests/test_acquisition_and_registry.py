from __future__ import annotations

import json
from pathlib import Path

from cortex_intelligence.acquisition.registry import (
    build_default_registry,
    compute_sha256,
    load_registry,
    save_registry,
    verify_file_integrity,
)
from cortex_intelligence.config import Settings


def test_verify_file_integrity_detects_missing_empty_mismatch_and_valid(tmp_path: Path) -> None:
    missing = verify_file_integrity(tmp_path / "does_not_exist.csv")
    assert missing["valid"] is False
    assert missing["reason"] == "file_missing"

    empty_file = tmp_path / "empty.csv"
    empty_file.write_bytes(b"")
    empty_res = verify_file_integrity(empty_file)
    assert empty_res["valid"] is False
    assert empty_res["reason"] == "empty_file"

    sample_file = tmp_path / "sample.csv"
    sample_file.write_bytes(b"col1,col2\n1,2\n")
    expected_sha = compute_sha256(sample_file)

    ok_res = verify_file_integrity(
        sample_file,
        expected_sha256=expected_sha,
        expected_size=sample_file.stat().st_size,
    )
    assert ok_res["valid"] is True
    assert ok_res["reason"] == "ok"

    bad_hash = verify_file_integrity(sample_file, expected_sha256="0" * 64)
    assert bad_hash["valid"] is False
    assert str(bad_hash["reason"]).startswith("sha256_mismatch")


def test_registry_persistence_and_origin_separation(isolated_settings: Settings) -> None:
    entries = build_default_registry(isolated_settings)
    reg_file = save_registry(entries, isolated_settings)
    assert reg_file.exists()

    loaded = load_registry(isolated_settings)
    by_id = {entry.dataset_id: entry for entry in loaded}

    assert "dataco-supply-chain-structured" in by_id
    assert by_id["dataco-supply-chain-structured"].data_origin.value == "public_open_dataset"
    assert "cortex-synthetic-procurement" in by_id
    assert by_id["cortex-synthetic-procurement"].data_origin.value == "synthetic"
    assert "cortex-mock-demonstration" in by_id
    assert by_id["cortex-mock-demonstration"].data_origin.value == "demonstration"
    assert "hub-supply-chain-disruption-monitoring" in by_id
    assert by_id["hub-supply-chain-disruption-monitoring"].processing_status == "evaluated_excluded_optional"
    assert "hub-anonnet" in by_id
    assert "hub-syndelay" in by_id

    raw_json = json.loads(reg_file.read_text(encoding="utf-8"))
    assert len(raw_json["datasets"]) == len(loaded)
