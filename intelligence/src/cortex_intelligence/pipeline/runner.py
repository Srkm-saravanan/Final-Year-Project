from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path

from cortex_intelligence.acquisition.dataco import ensure_dataco_dataset
from cortex_intelligence.acquisition.registry import (
    build_default_registry,
    save_registry,
)
from cortex_intelligence.config import Settings, ensure_directories, get_settings
from cortex_intelligence.graph.ingestor import ingest_bundle_to_neo4j, validate_graph_integrity
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graph.queries import get_graph_statistics
from cortex_intelligence.models import IngestionJobRecord, utc_now_iso
from cortex_intelligence.pipeline.cleaning import clean_dataco_csv
from cortex_intelligence.pipeline.discovery import discover_sources
from cortex_intelligence.pipeline.extraction import extract_canonical_graph_bundle
from cortex_intelligence.pipeline.profiling import profile_dataco_csv
from cortex_intelligence.pipeline.validation import validate_csv_source


def save_job_record(job: IngestionJobRecord, settings: Settings | None = None) -> Path:
    cfg = settings or get_settings()
    ensure_directories(cfg)
    path = cfg.jobs_dir / f"{job.job_id}.json"
    path.write_text(json.dumps(job.model_dump(mode="json"), indent=2), encoding="utf-8")
    return path


def load_job_record(job_id: str, settings: Settings | None = None) -> IngestionJobRecord | None:
    cfg = settings or get_settings()
    # Prevent path traversal via job_id
    safe_id = Path(job_id).name
    if safe_id != job_id:
        return None
    path = cfg.jobs_dir / f"{safe_id}.json"
    if not path.exists():
        return None
    return IngestionJobRecord.model_validate_json(path.read_text(encoding="utf-8"))


def run_ingestion_pipeline(
    settings: Settings | None = None,
    mode: str = "full",
    source_csv: Path | None = None,
    skip_neo4j: bool = False,
    include_demonstration: bool = True,
    include_synthetic: bool = True,
    neo4j_client: Neo4jClient | None = None,
    batch_size: int = 5000,
) -> IngestionJobRecord:
    """Stages 1-10: End-to-end discovery, validation, profiling, cleaning, extraction & Neo4j load."""
    cfg = settings or get_settings()
    ensure_directories(cfg)

    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    job_id = f"job-{stamp}-{uuid.uuid4().hex[:8]}"

    if source_csv is not None:
        target_csv = source_csv
    elif mode == "sample":
        target_csv = cfg.samples_dir / "dataco_sample.csv"
    else:
        target_csv = cfg.raw_dir / "dataco" / "DataCoSupplyChainDataset.csv"

    job = IngestionJobRecord(
        job_id=job_id,
        mode=mode,
        status="running",
        started_at=utc_now_iso(),
        source_path=str(target_csv),
    )
    save_job_record(job, cfg)

    try:
        # Stage 1: Discovery
        discover_sources(cfg, override_dataco_csv=target_csv)

        # Stage 2: Validation
        dict_path = cfg.raw_dir / "dataco" / "DescriptionDataCoSupplyChain.csv"
        expected_sha = None
        if target_csv.name == "DataCoSupplyChainDataset.csv" and mode == "full" and source_csv is None:
            expected_sha = "fa6d022ed437155e1a2f0378710602848703c8a7f203f7ff5d77805bf8480aa6"

        val_res = validate_csv_source(
            target_csv,
            dictionary_csv_path=dict_path if dict_path.exists() else None,
            expected_sha256=expected_sha,
        )
        if not val_res.valid:
            raise ValueError(val_res.error or f"Validation failed for {target_csv}")

        # Stage 3 & 4: Schema & Profiling
        profile = profile_dataco_csv(target_csv, encoding=val_res.encoding)

        # Stage 5 & 6: Cleaning & ML-leakage split
        cleaned = clean_dataco_csv(
            target_csv,
            encoding=val_res.encoding,
            undocumented_columns=val_res.undocumented_columns,
        )
        job.cleaning_stats = cleaned.stats

        # Stage 7 & 8: Canonical Entity & Relationship Extraction
        doc_paths = [
            (cfg.project_root / "UG_PROJECT_FIRST_REVIEW_PRESENTATION.md", "UG Project Review Deck", "markdown"),
            (cfg.project_root / "README.md", "CORTEX Project README", "markdown"),
        ]
        bundle = extract_canonical_graph_bundle(
            cleaned_rows=cleaned.rows,
            ingestion_job_id=job_id,
            synthetic_seed=cfg.synthetic_random_seed,
            source_dataset=target_csv.name,
            mock_json_path=cfg.project_root / "mock-data.json",
            document_paths=doc_paths,
            synthetic_export_dir=cfg.processed_dir / "synthetic_procurement",
            include_demonstration=include_demonstration,
            include_synthetic=include_synthetic,
        )
        job.entity_counts = bundle.entity_counts()
        job.relationship_counts = {
            "BELONGS_TO_DEPT": len(bundle.categories),
            "BELONGS_TO_CATEGORY": len(bundle.products),
            "SEGMENT_PLACED_ORDER": len(bundle.orders),
            "ORDER_SHIPPED_VIA": len(bundle.shipments),
            "SHIPMENT_DELIVERED_TO": len(bundle.shipments),
            "ORDER_CONTAINS_PRODUCT": len(bundle.order_items),
            "SUPPLIES": len(bundle.supplier_products),
            "WAREHOUSE_BELONGS_TO_REGION": len(bundle.warehouses),
            "WAREHOUSE_HAS_INVENTORY": len(bundle.inventory),
            "INVENTORY_BELONGS_TO_PRODUCT": len(bundle.inventory),
            "STORED_AT": len(bundle.inventory),
            "PO_ORDERED_FROM": len(bundle.purchase_orders),
            "PO_DELIVERS_TO": len(bundle.purchase_orders),
            "PO_CONTAINS": len(bundle.po_items),
            "HAS_DELAY": sum(1 for po in bundle.purchase_orders if po.is_delayed),
            "AFFECTS": len(bundle.po_inventory_impacts),
            "DEMO_REL": len(bundle.demo_rels),
        }

        # Stage 9: Persist quality profile & update provenance registry
        (cfg.reports_dir / "data_quality_summary.json").write_text(
            json.dumps(
                {
                    "job_id": job_id,
                    "generated_at": utc_now_iso(),
                    "validation": {
                        "sha256": val_res.sha256,
                        "file_size_bytes": val_res.file_size_bytes,
                        "encoding": val_res.encoding,
                        "undocumented_columns": val_res.undocumented_columns,
                    },
                    "profile": profile.to_dict(),
                    "cleaning": cleaned.stats.model_dump(mode="json"),
                    "entity_counts": job.entity_counts,
                    "relationship_counts": job.relationship_counts,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

        # Stage 10: Neo4j Ingestion & Integrity Verification
        if not skip_neo4j:
            owns_client = neo4j_client is None
            client = neo4j_client or Neo4jClient(cfg)
            try:
                write_summary = ingest_bundle_to_neo4j(client, bundle, batch_size=batch_size)
                integrity = validate_graph_integrity(client)
                stats = get_graph_statistics(client)
                job.neo4j_ingested = True
                job.neo4j_write_summary = {
                    **write_summary,
                    "integrity": integrity,
                    "graph_statistics": {
                        "total_nodes": stats["total_nodes"],
                        "total_relationships": stats["total_relationships"],
                        "nodes_by_label": stats["nodes_by_label"],
                        "relationships_by_type": stats["relationships_by_type"],
                        "nodes_by_data_origin": stats["nodes_by_data_origin"],
                        "constraints_count": stats["constraints_count"],
                        "indexes_count": stats["indexes_count"],
                    },
                }
                (cfg.reports_dir / "graph_statistics.json").write_text(
                    json.dumps(stats, indent=2),
                    encoding="utf-8",
                )
            finally:
                if owns_client:
                    client.close()

        # Refresh registry entries with latest processing status
        entries = build_default_registry(cfg)
        for entry in entries:
            if entry.dataset_id == "dataco-supply-chain-structured" and mode == "full" and source_csv is None:
                entry.processing_status = "ingested_to_neo4j" if job.neo4j_ingested else "cleaned_staged"
            elif entry.dataset_id == "cortex-mock-demonstration" and include_demonstration:
                entry.processing_status = "ingested_to_neo4j" if job.neo4j_ingested else "extracted"
            elif entry.dataset_id == "cortex-synthetic-procurement" and include_synthetic:
                entry.processing_status = "ingested_to_neo4j" if job.neo4j_ingested else "generated_ready"
        save_registry(entries, cfg)

        job.status = "completed"
        job.completed_at = utc_now_iso()
        save_job_record(job, cfg)
        return job

    except Exception as exc:
        job.status = "failed"
        job.completed_at = utc_now_iso()
        job.error_message = str(exc)
        save_job_record(job, cfg)
        raise


def acquire_datasets(settings: Settings | None = None, force: bool = False) -> dict[str, object]:
    return ensure_dataco_dataset(settings=settings, force_download=force)

