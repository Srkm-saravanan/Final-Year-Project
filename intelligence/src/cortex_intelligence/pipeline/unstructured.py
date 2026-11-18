from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Protocol

from cortex_intelligence.models import DataOrigin, DocumentChunk, DocumentEntity


class LLMExtractionInterface(Protocol):
    """Reserved interface for Phase D2 LLM-assisted entity/triplet extraction (not invoked in D1)."""

    def extract_triples(self, chunks: list[DocumentChunk]) -> list[dict[str, str]]:
        ...


def load_and_chunk_documents(
    doc_paths: list[tuple[Path, str, str]],
    ingestion_job_id: str,
    chunk_size: int = 1200,
    chunk_overlap: int = 150,
) -> tuple[list[DocumentEntity], list[DocumentChunk]]:
    """Prepare structured metadata & deterministic chunks for text/Markdown documents."""
    docs: list[DocumentEntity] = []
    chunks: list[DocumentChunk] = []

    for path, title, doc_type in doc_paths:
        if not path.exists() or not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        file_sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
        doc_id = f"doc:{path.name}"

        step = max(1, chunk_size - chunk_overlap)
        doc_chunks: list[DocumentChunk] = []
        idx = 0
        for start in range(0, max(1, len(text)), step):
            end = min(len(text), start + chunk_size)
            slice_text = text[start:end]
            chunk_sha = hashlib.sha256(slice_text.encode("utf-8")).hexdigest()
            doc_chunks.append(
                DocumentChunk(
                    chunk_id=f"{doc_id}:chunk:{idx}",
                    document_entity_id=doc_id,
                    chunk_index=idx,
                    page_or_section=f"char:{start}-{end}",
                    char_start=start,
                    char_end=end,
                    text_preview=slice_text[:180].replace("\n", " ").strip(),
                    sha256=chunk_sha,
                )
            )
            idx += 1
            if end >= len(text):
                break

        docs.append(
            DocumentEntity(
                entity_id=doc_id,
                title=title,
                doc_type=doc_type,
                source_path=path.name,
                sha256=file_sha,
                chunk_count=len(doc_chunks),
                source_dataset=path.name,
                source_record_id=f"document:{path.name}",
                data_origin=DataOrigin.DEMONSTRATION,
                ingestion_job_id=ingestion_job_id,
            )
        )
        chunks.extend(doc_chunks)

    return docs, chunks

