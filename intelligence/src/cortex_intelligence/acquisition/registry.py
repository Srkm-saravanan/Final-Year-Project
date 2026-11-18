from __future__ import annotations

import hashlib
import json
from pathlib import Path

from cortex_intelligence.config import Settings, ensure_directories, get_settings
from cortex_intelligence.models import DataOrigin, DatasetRegistryEntry, utc_now_iso

DATACO_OFFICIAL_URL = "https://data.mendeley.com/datasets/8gx2fvg2k6/5"
DATACO_DOI = "10.17632/8gx2fvg2k6.5"
DATACO_API_URL = "https://data.mendeley.com/public-api/datasets/8gx2fvg2k6"
DATACO_AUTHORS = ["Fabian Constante", "Fernando Silva", "António Pereira"]
DATACO_LICENSE = "Creative Commons Attribution 4.0 International (CC BY 4.0)"

DATACO_EXPECTED_FILES = {
    "DataCoSupplyChainDataset.csv": {
        "sha256": "fa6d022ed437155e1a2f0378710602848703c8a7f203f7ff5d77805bf8480aa6",
        "size": 95910149,
        "download_url": "https://data.mendeley.com/public-files/datasets/8gx2fvg2k6/files/72784be5-36d3-44fe-b75d-0edbf1999f65/file_downloaded",
    },
    "DescriptionDataCoSupplyChain.csv": {
        "sha256": "9828e34669bd6d77e3b4463364cc44a5d52446b5e246fc258758cfe592566c4b",
        "size": 3444,
        "download_url": "https://data.mendeley.com/public-files/datasets/8gx2fvg2k6/files/29dc7b05-dda6-4834-8354-5b5cc44430df/file_downloaded",
    },
}


def compute_sha256(file_path: Path) -> str:
    digest = hashlib.sha256()
    with file_path.open("rb") as fh:
        while chunk := fh.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def verify_file_integrity(
    file_path: Path,
    expected_sha256: str | None = None,
    expected_size: int | None = None,
) -> dict[str, object]:
    if not file_path.exists() or not file_path.is_file():
        return {"exists": False, "valid": False, "reason": "file_missing"}

    actual_size = file_path.stat().st_size
    if actual_size == 0:
        return {"exists": True, "size": 0, "valid": False, "reason": "empty_file"}

    actual_sha = compute_sha256(file_path)
    size_ok = expected_size is None or actual_size == expected_size
    hash_ok = expected_sha256 is None or actual_sha.lower() == expected_sha256.lower()
    valid = size_ok and hash_ok
    reason = "ok"
    if not size_ok:
        reason = f"size_mismatch (expected={expected_size}, actual={actual_size})"
    elif not hash_ok:
        reason = f"sha256_mismatch (expected={expected_sha256}, actual={actual_sha})"

    return {
        "exists": True,
        "size": actual_size,
        "sha256": actual_sha,
        "valid": valid,
        "reason": reason,
    }


def registry_path(settings: Settings | None = None) -> Path:
    cfg = settings or get_settings()
    return cfg.registry_dir / "dataset_registry.json"


def build_default_registry(settings: Settings | None = None) -> list[DatasetRegistryEntry]:
    cfg = settings or get_settings()
    ensure_directories(cfg)
    now = utc_now_iso()

    entries: list[DatasetRegistryEntry] = []

    dataco_main = cfg.raw_dir / "dataco" / "DataCoSupplyChainDataset.csv"
    dataco_main_check = verify_file_integrity(
        dataco_main,
        expected_sha256=DATACO_EXPECTED_FILES["DataCoSupplyChainDataset.csv"]["sha256"],
        expected_size=DATACO_EXPECTED_FILES["DataCoSupplyChainDataset.csv"]["size"],
    )
    entries.append(
        DatasetRegistryEntry(
            dataset_id="dataco-supply-chain-structured",
            dataset_name="DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS",
            original_url=DATACO_OFFICIAL_URL,
            doi=DATACO_DOI,
            authors_or_publisher=DATACO_AUTHORS,
            license=DATACO_LICENSE,
            version="5",
            acquisition_date=now if dataco_main_check.get("valid") else None,
            original_filename="DataCoSupplyChainDataset.csv",
            local_relative_path="data/raw/dataco/DataCoSupplyChainDataset.csv",
            file_size_bytes=(
                int(dataco_main_check["size"]) if dataco_main_check.get("exists") else None
            ),
            sha256_checksum=(
                str(dataco_main_check["sha256"]) if dataco_main_check.get("exists") else None
            ),
            data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
            processing_status=(
                "validated_ready"
                if dataco_main_check.get("valid")
                else f"not_ready:{dataco_main_check.get('reason')}"
            ),
            notes=(
                "Primary Dataset A (180,519 rows x 53 columns, latin-1 encoding). "
                "PII fields removed during cleaning; post-outcome delivery fields separated "
                "from prediction features to prevent ML leakage."
            ),
        )
    )

    dataco_desc = cfg.raw_dir / "dataco" / "DescriptionDataCoSupplyChain.csv"
    dataco_desc_check = verify_file_integrity(
        dataco_desc,
        expected_sha256=DATACO_EXPECTED_FILES["DescriptionDataCoSupplyChain.csv"]["sha256"],
        expected_size=DATACO_EXPECTED_FILES["DescriptionDataCoSupplyChain.csv"]["size"],
    )
    entries.append(
        DatasetRegistryEntry(
            dataset_id="dataco-variable-descriptions",
            dataset_name="DataCo Variable Description Dictionary",
            original_url=DATACO_OFFICIAL_URL,
            doi=DATACO_DOI,
            authors_or_publisher=DATACO_AUTHORS,
            license=DATACO_LICENSE,
            version="5",
            acquisition_date=now if dataco_desc_check.get("valid") else None,
            original_filename="DescriptionDataCoSupplyChain.csv",
            local_relative_path="data/raw/dataco/DescriptionDataCoSupplyChain.csv",
            file_size_bytes=(
                int(dataco_desc_check["size"]) if dataco_desc_check.get("exists") else None
            ),
            sha256_checksum=(
                str(dataco_desc_check["sha256"]) if dataco_desc_check.get("exists") else None
            ),
            data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
            processing_status=(
                "validated_dictionary"
                if dataco_desc_check.get("valid")
                else f"not_ready:{dataco_desc_check.get('reason')}"
            ),
            notes=(
                "Documents 52 variables; note column 'Order Zipcode' appears in the structured CSV "
                "(53 columns total) without a row in this dictionary."
            ),
        )
    )

    entries.append(
        DatasetRegistryEntry(
            dataset_id="dataco-tokenized-access-logs",
            dataset_name="DataCo Tokenized Clickstream Access Logs",
            original_url=DATACO_OFFICIAL_URL,
            doi=DATACO_DOI,
            authors_or_publisher=DATACO_AUTHORS,
            license=DATACO_LICENSE,
            version="5",
            acquisition_date=None,
            original_filename="tokenized_access_logs.csv",
            local_relative_path=None,
            file_size_bytes=95446364,
            sha256_checksum="7a4372df63a1e87f5add68bc036bb6064db09069998f25a679aec39f1a8d7765",
            data_origin=DataOrigin.PUBLIC_OPEN_DATASET,
            processing_status="evaluated_excluded_clickstream",
            notes=(
                "Inspected header/sample (Product,Category,Date,Month,Hour,Department,ip,url). "
                "Contains anonymous web clickstream browsing logs without supplier, procurement, "
                "inventory, or order delivery delay linkage; excluded to avoid irrelevant graph noise."
            ),
        )
    )

    # Dataset B candidates evaluated from https://supplychaindatahub.org/datasets/
    entries.extend(
        [
            DatasetRegistryEntry(
                dataset_id="hub-supply-chain-disruption-monitoring",
                dataset_name="Supply Chain Disruption Monitoring Dataset",
                original_url="https://supplychaindatahub.org/datasets/supply-chain-disruption/",
                doi=None,
                authors_or_publisher=["Sara Almahri", "Liming Xu", "Alexandra Brintrup"],
                license="CC BY-NC 4.0 (Non-Commercial)",
                version="2026-04-15 (GitHub main)",
                acquisition_date=None,
                original_filename="supplychainKG_clean.csv",
                local_relative_path=None,
                file_size_bytes=2041389,
                sha256_checksum=None,
                data_origin=DataOrigin.EXTERNAL_RESEARCH,
                processing_status="evaluated_excluded_optional",
                notes=(
                    "Linked repo github.com/sara-almahri/supply-chain-disruption-monitoring contains "
                    "B2B heavy-industry triples (Oil & Gas, Steel) incompatible with DataCo retail product lines "
                    "and carries CC BY-NC 4.0 non-commercial terms."
                ),
            ),
            DatasetRegistryEntry(
                dataset_id="hub-anonnet",
                dataset_name="AnonNet Dataset",
                original_url="https://supplychaindatahub.org/datasets/anonnet/",
                doi=None,
                authors_or_publisher=["Liming Xu", "Yunbo Long", "Alexandra Brintrup"],
                license="Unspecified (No LICENSE file in GitHub repo)",
                version="2025 (MIM2025)",
                acquisition_date=None,
                original_filename="mim2025_network_challenge",
                local_relative_path=None,
                file_size_bytes=None,
                sha256_checksum=None,
                data_origin=DataOrigin.EXTERNAL_RESEARCH,
                processing_status="evaluated_excluded_optional",
                notes=(
                    "Excluded: missing explicit repository license, anonymized topology lacks DataCo product "
                    "catalog keys and procurement delay timestamps."
                ),
            ),
            DatasetRegistryEntry(
                dataset_id="hub-syndelay",
                dataset_name="SynDelay Dataset",
                original_url="https://supplychaindatahub.org/datasets/syndelay/",
                doi=None,
                authors_or_publisher=["Liming Xu", "Yunbo Long", "Alexandra Brintrup"],
                license="Unspecified (No LICENSE file in GitHub repo)",
                version="v1 (MIM2025)",
                acquisition_date=None,
                original_filename="syndelay_v1.csv",
                local_relative_path=None,
                file_size_bytes=56309566,
                sha256_checksum=None,
                data_origin=DataOrigin.SYNTHETIC,
                processing_status="evaluated_excluded_optional",
                notes=(
                    "Excluded: generative clone of DataCo columns using noisy floating-point IDs/Excel dates "
                    "(e.g. customer_id=12446.5625), missing supplier entities and explicit repository license."
                ),
            ),
        ]
    )

    # Dataset C: Existing CORTEX Mock Data
    mock_file = cfg.project_root / "mock-data.json"
    mock_check = verify_file_integrity(mock_file)
    entries.append(
        DatasetRegistryEntry(
            dataset_id="cortex-mock-demonstration",
            dataset_name="CORTEX Phase A-C Demonstration Dataset & Seed Entities",
            original_url="local://mock-data.json",
            doi=None,
            authors_or_publisher=["CORTEX Capstone Project Team"],
            license="Internal Academic Project (Apache-2.0 metadata)",
            version="Phase C Baseline",
            acquisition_date=now if mock_check.get("valid") else None,
            original_filename="mock-data.json",
            local_relative_path="mock-data.json",
            file_size_bytes=int(mock_check["size"]) if mock_check.get("exists") else None,
            sha256_checksum=str(mock_check["sha256"]) if mock_check.get("exists") else None,
            data_origin=DataOrigin.DEMONSTRATION,
            processing_status="validated_ready" if mock_check.get("valid") else "missing",
            notes=(
                "Strictly tagged data_origin='demonstration' and namespaced with 'demo:' entity IDs "
                "so demonstration entities never co-mingle with real DataCo records."
            ),
        )
    )

    # Dataset D: Synthetic Procurement Extension (updated after generation)
    synth_manifest = cfg.processed_dir / "synthetic_procurement" / "manifest.json"
    synth_check = verify_file_integrity(synth_manifest)
    entries.append(
        DatasetRegistryEntry(
            dataset_id="cortex-synthetic-procurement",
            dataset_name="CORTEX Reproducible Synthetic Procurement & Inventory Extension",
            original_url="local://intelligence/src/cortex_intelligence/generators/synthetic_procurement.py",
            doi=None,
            authors_or_publisher=["CORTEX Phase D1 Pipeline"],
            license="Project-internal reproducible generator",
            version=f"seed-{cfg.synthetic_random_seed}",
            acquisition_date=now if synth_check.get("valid") else None,
            original_filename="manifest.json",
            local_relative_path="data/processed/synthetic_procurement/manifest.json",
            file_size_bytes=int(synth_check["size"]) if synth_check.get("exists") else None,
            sha256_checksum=str(synth_check["sha256"]) if synth_check.get("exists") else None,
            data_origin=DataOrigin.SYNTHETIC,
            processing_status="generated_ready" if synth_check.get("valid") else "pending_generation",
            notes=(
                f"Deterministic generator (seed={cfg.synthetic_random_seed}) anchoring synthetic Suppliers, "
                "Warehouses, Inventory, PurchaseOrders, and DelayEvents to verified DataCo Product & Region keys."
            ),
        )
    )

    return entries


def save_registry(entries: list[DatasetRegistryEntry], settings: Settings | None = None) -> Path:
    cfg = settings or get_settings()
    ensure_directories(cfg)
    path = registry_path(cfg)
    payload = {
        "schema_version": "1.0.0",
        "updated_at": utc_now_iso(),
        "datasets": [entry.model_dump(mode="json") for entry in entries],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def load_registry(settings: Settings | None = None) -> list[DatasetRegistryEntry]:
    cfg = settings or get_settings()
    path = registry_path(cfg)
    if not path.exists():
        entries = build_default_registry(cfg)
        save_registry(entries, cfg)
        return entries
    raw = json.loads(path.read_text(encoding="utf-8"))
    return [DatasetRegistryEntry.model_validate(item) for item in raw.get("datasets", [])]

