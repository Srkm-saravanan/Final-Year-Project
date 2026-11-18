from __future__ import annotations

import argparse
import json
from pathlib import Path

from cortex_intelligence.config import get_settings
from cortex_intelligence.graph.neo4j_client import Neo4jClient
from cortex_intelligence.graphrag.models import DocumentIngestRequest, GraphRAGQueryRequest
from cortex_intelligence.graphrag.service import (
    answer_graphrag_question,
    bootstrap_default_documents,
    ingest_document_request,
)
from cortex_intelligence.pipeline.runner import acquire_datasets, run_ingestion_pipeline


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="cortex-ingest",
        description="CORTEX Enterprise Data Acquisition, Ingestion, Neo4j KG & GraphRAG CLI",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    acq = sub.add_parser("acquire", help="Download and SHA-256 verify official DataCo datasets")
    acq.add_argument("--force", action="store_true", help="Re-download even if checksum matches")

    ing = sub.add_parser("ingest", help="Run full 10-stage ingestion pipeline")
    ing.add_argument("--mode", choices=["full", "sample"], default="full")
    ing.add_argument("--source-csv", type=Path, default=None)
    ing.add_argument("--skip-neo4j", action="store_true")
    ing.add_argument("--no-demo", action="store_true")
    ing.add_argument("--no-synthetic", action="store_true")
    ing.add_argument("--batch-size", type=int, default=5000)

    docs_cmd = sub.add_parser("ingest-docs", help="Ingest unstructured PDF/TXT/MD documents into GraphRAG")
    docs_cmd.add_argument("--file", type=str, default=None, help="Specific document path under data/ or data/documents/")
    docs_cmd.add_argument("--title", type=str, default=None)

    rag_cmd = sub.add_parser("query-graphrag", help="Run grounded GraphRAG query against Neo4j")
    rag_cmd.add_argument("--query", type=str, required=True)
    rag_cmd.add_argument("--top-k", type=int, default=6)
    rag_cmd.add_argument("--include-demo", action="store_true")
    rag_cmd.add_argument(
        "--temporal-mode",
        choices=["scenario_aware", "strict_active", "historical_all"],
        default="scenario_aware",
    )

    args = parser.parse_args()
    settings = get_settings()

    if args.command == "acquire":
        out = acquire_datasets(settings=settings, force=args.force)
        print(json.dumps(out, indent=2))
        return 0

    if args.command == "ingest":
        job = run_ingestion_pipeline(
            settings=settings,
            mode=args.mode,
            source_csv=args.source_csv,
            skip_neo4j=args.skip_neo4j,
            include_demonstration=not args.no_demo,
            include_synthetic=not args.no_synthetic,
            batch_size=args.batch_size,
        )
        print(json.dumps(job.model_dump(mode="json"), indent=2))
        return 0

    if args.command == "ingest-docs":
        client = Neo4jClient(settings)
        try:
            if args.file:
                res = ingest_document_request(
                    client,
                    DocumentIngestRequest(file_path=args.file, title=args.title),
                    settings=settings,
                )
                print(json.dumps(res.model_dump(mode="json"), indent=2))
            else:
                results = bootstrap_default_documents(client, settings=settings)
                print(json.dumps([r.model_dump(mode="json") for r in results], indent=2))
        finally:
            client.close()
        return 0

    if args.command == "query-graphrag":
        client = Neo4jClient(settings)
        try:
            ans = answer_graphrag_question(
                client,
                GraphRAGQueryRequest(
                    query=args.query,
                    top_k=args.top_k,
                    include_demonstration=args.include_demo,
                    temporal_mode=args.temporal_mode,
                ),
                settings=settings,
            )
            print(json.dumps(ans.model_dump(mode="json"), indent=2))
        finally:
            client.close()
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())

