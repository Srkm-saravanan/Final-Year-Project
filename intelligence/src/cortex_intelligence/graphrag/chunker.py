from __future__ import annotations

import hashlib
import re

from cortex_intelligence.graphrag.models import ChunkRecord, ExtractedDocumentPayload, ExtractedSection
from cortex_intelligence.models.canonical import DataOrigin

_TOKEN_RE = re.compile(r"\S+")


def _find_clean_split(text: str, start: int, target_end: int) -> int:
    if target_end >= len(text):
        return len(text)
    window_start = max(start + int((target_end - start) * 0.55), start + 1)
    window = text[window_start:target_end]

    for marker in ("\n\n", ".\n", ". ", "!\n", "! ", "?\n", "? ", "\n"):
        pos = window.rfind(marker)
        if pos != -1:
            return window_start + pos + len(marker)

    space_pos = window.rfind(" ")
    if space_pos != -1:
        return window_start + space_pos + 1

    return target_end


def _advance_clean_start(text: str, prev_end: int, raw_next_start: int) -> int:
    if raw_next_start <= 0:
        return 0
    if raw_next_start >= prev_end:
        return prev_end
    # Move forward to the start of a word so overlaps never slice mid-word
    pos = raw_next_start
    while pos < prev_end and not text[pos].isspace():
        pos += 1
    while pos < prev_end and text[pos].isspace():
        pos += 1
    return pos if pos < prev_end else raw_next_start


def _split_section_text(section: ExtractedSection, chunk_size: int, chunk_overlap: int) -> list[tuple[int, int, str]]:
    text = section.text.strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [(0, len(text), text)]

    pieces: list[tuple[int, int, str]] = []
    start = 0
    safe_overlap = min(chunk_overlap, max(0, chunk_size // 2))
    while start < len(text):
        raw_end = min(len(text), start + chunk_size)
        end = _find_clean_split(text, start, raw_end)
        if end <= start:
            end = raw_end
        slice_text = text[start:end].strip()
        if slice_text:
            pieces.append((start, end, slice_text))
        if end >= len(text):
            break
        raw_next = max(start + 1, end - safe_overlap)
        start = _advance_clean_start(text, end, raw_next)
    return pieces


def chunk_extracted_document(
    payload: ExtractedDocumentPayload,
    ingestion_job_id: str,
    data_origin: DataOrigin = DataOrigin.ENTERPRISE_DOCUMENT,
    chunk_size: int = 900,
    chunk_overlap: int = 150,
    embedding_model: str = "cortex-local-semantic-512-v1",
    embedding_dimensions: int = 512,
) -> list[ChunkRecord]:
    """Split an extracted document along page/heading/sentence boundaries into provenance-rich chunks."""
    if chunk_size < 100:
        raise ValueError("chunk_size must be at least 100 characters.")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap must be >= 0 and strictly less than chunk_size.")

    sections = payload.sections or [
        ExtractedSection(
            page_number=1 if payload.doc_type == "pdf" else None,
            section_title=payload.title,
            page_or_section="section:root",
            text=payload.full_text,
        )
    ]

    records: list[ChunkRecord] = []
    global_cursor = 0
    chunk_idx = 0

    for sec in sections:
        sec_text = sec.text.strip()
        if not sec_text:
            continue
        sec_offset = payload.full_text.find(sec_text, global_cursor)
        if sec_offset == -1:
            sec_offset = global_cursor

        for local_start, local_end, chunk_text in _split_section_text(sec, chunk_size, chunk_overlap):
            char_start = sec_offset + local_start
            char_end = sec_offset + local_end
            chunk_id = f"{payload.document_entity_id}:chunk:{chunk_idx}"
            chunk_sha = hashlib.sha256(chunk_text.encode("utf-8")).hexdigest()
            token_count = len(_TOKEN_RE.findall(chunk_text))
            page_or_sec = sec.page_or_section
            if sec.page_number is not None:
                page_or_sec = f"page:{sec.page_number}"
            elif sec.section_title:
                page_or_sec = f"section:{sec.section_title[:80]}"

            records.append(
                ChunkRecord(
                    entity_id=chunk_id,
                    chunk_id=chunk_id,
                    document_entity_id=payload.document_entity_id,
                    chunk_index=chunk_idx,
                    page_number=sec.page_number,
                    section_title=sec.section_title,
                    page_or_section=page_or_sec,
                    char_start=char_start,
                    char_end=char_end,
                    token_count=token_count,
                    text=chunk_text,
                    text_preview=chunk_text[:200].replace("\n", " ").strip(),
                    sha256=chunk_sha,
                    document_date=payload.document_date,
                    embedding=[],
                    embedding_model=embedding_model,
                    embedding_dimensions=embedding_dimensions,
                    source_dataset=payload.filename,
                    source_record_id=f"{payload.document_entity_id}:chunk:{chunk_idx}",
                    data_origin=data_origin,
                    ingestion_job_id=ingestion_job_id,
                )
            )
            chunk_idx += 1

        global_cursor = max(global_cursor, sec_offset + len(sec_text))

    return records

