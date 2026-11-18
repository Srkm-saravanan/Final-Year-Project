from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from pathlib import Path

from pypdf import PdfReader

from cortex_intelligence.graphrag.models import ExtractedDocumentPayload, ExtractedSection

SUPPORTED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown", ".csv", ".json"}
_HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*$")
_ISO_DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")


def sanitize_document_id(raw_id: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._:-]+", "_", raw_id.strip()).strip("_")
    if not cleaned:
        cleaned = "untitled_document"
    return cleaned if cleaned.startswith("doc:") else f"doc:{cleaned}"


def _decode_text(raw_bytes: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return raw_bytes.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="replace")


def _detect_document_date(text: str, provided_date: str | None = None) -> str | None:
    if provided_date and provided_date.strip():
        return provided_date.strip()
    match = _ISO_DATE_RE.search(text[:2000])
    return match.group(1) if match else None


def _split_markdown_or_text_sections(text: str, doc_title: str) -> list[ExtractedSection]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized:
        return []

    sections: list[ExtractedSection] = []
    current_title = doc_title
    current_lines: list[str] = []

    for line in normalized.split("\n"):
        heading_match = _HEADING_RE.match(line)
        if heading_match:
            if current_lines:
                body = "\n".join(current_lines).strip()
                if body:
                    sections.append(
                        ExtractedSection(
                            page_number=None,
                            section_title=current_title,
                            page_or_section=f"section:{current_title[:80]}",
                            text=body,
                        )
                    )
                current_lines = []
            current_title = heading_match.group(2).strip()
            current_lines.append(line.strip())
        else:
            current_lines.append(line)

    if current_lines:
        body = "\n".join(current_lines).strip()
        if body:
            sections.append(
                ExtractedSection(
                    page_number=None,
                    section_title=current_title,
                    page_or_section=f"section:{current_title[:80]}",
                    text=body,
                )
            )
    return sections


def _extract_pdf_sections(raw_bytes: bytes) -> tuple[list[ExtractedSection], int]:
    reader = PdfReader(io.BytesIO(raw_bytes))
    sections: list[ExtractedSection] = []
    for idx, page in enumerate(reader.pages, start=1):
        extracted = (page.extract_text() or "").replace("\r\n", "\n").replace("\r", "\n").strip()
        if extracted:
            first_line = next((ln.strip() for ln in extracted.splitlines() if ln.strip()), f"Page {idx}")
            sections.append(
                ExtractedSection(
                    page_number=idx,
                    section_title=first_line[:120],
                    page_or_section=f"page:{idx}",
                    text=extracted,
                )
            )
    return sections, len(reader.pages)


def _extract_csv_sections(text: str, filename: str, max_rows: int = 500) -> list[ExtractedSection]:
    buf = io.StringIO(text)
    reader = csv.DictReader(buf)
    rows = []
    for idx, row in enumerate(reader, start=1):
        if idx > max_rows:
            break
        parts = [f"{k}: {v}" for k, v in row.items() if v not in (None, "")]
        rows.append(f"Row {idx}: " + " | ".join(parts))
    if not rows:
        return []
    block_size = 25
    sections: list[ExtractedSection] = []
    for i in range(0, len(rows), block_size):
        start_row = i + 1
        end_row = min(len(rows), i + block_size)
        sections.append(
            ExtractedSection(
                page_number=None,
                section_title=f"{filename} rows {start_row}-{end_row}",
                page_or_section=f"rows:{start_row}-{end_row}",
                text="\n".join(rows[i:end_row]),
            )
        )
    return sections


def _extract_json_sections(text: str, title: str) -> list[ExtractedSection]:
    parsed = json.loads(text)
    pretty = json.dumps(parsed, indent=2, ensure_ascii=False)
    return [
        ExtractedSection(
            page_number=None,
            section_title=title,
            page_or_section="json:root",
            text=pretty,
        )
    ]


def extract_document_from_bytes(
    raw_bytes: bytes,
    filename: str,
    title: str | None = None,
    doc_type: str | None = None,
    document_id: str | None = None,
    source_path: str | None = None,
    document_date: str | None = None,
) -> ExtractedDocumentPayload:
    """Extract normalized sections and text from supported file formats (.pdf, .txt, .md, .csv, .json)."""
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        raise ValueError(
            f"Unsupported document format '{ext or 'unknown'}'. Supported formats: {sorted(SUPPORTED_EXTENSIONS)}"
        )
    if not raw_bytes:
        raise ValueError(f"Document '{filename}' is empty.")

    sha256 = hashlib.sha256(raw_bytes).hexdigest()
    resolved_title = (title or Path(filename).stem.replace("_", " ").replace("-", " ")).strip() or filename
    resolved_doc_type = (doc_type or ext.lstrip(".")).lower()
    resolved_id = sanitize_document_id(document_id or filename)
    resolved_source_path = source_path or filename

    page_count: int | None = None
    if ext == ".pdf":
        sections, page_count = _extract_pdf_sections(raw_bytes)
        if not sections:
            raise ValueError(f"PDF document '{filename}' yielded no extractable text.")
        full_text = "\n\n".join(sec.text for sec in sections)
    else:
        decoded = _decode_text(raw_bytes)
        if not decoded.strip():
            raise ValueError(f"Text document '{filename}' contains only whitespace.")
        if ext == ".csv":
            sections = _extract_csv_sections(decoded, filename=filename)
        elif ext == ".json":
            sections = _extract_json_sections(decoded, title=resolved_title)
        else:
            sections = _split_markdown_or_text_sections(decoded, doc_title=resolved_title)
        full_text = "\n\n".join(sec.text for sec in sections) if sections else decoded.strip()
        if not sections and full_text:
            sections = [
                ExtractedSection(
                    page_number=None,
                    section_title=resolved_title,
                    page_or_section="section:root",
                    text=full_text,
                )
            ]

    resolved_date = _detect_document_date(full_text, provided_date=document_date)

    return ExtractedDocumentPayload(
        document_entity_id=resolved_id,
        title=resolved_title,
        filename=filename,
        doc_type=resolved_doc_type,
        source_path=resolved_source_path,
        sha256=sha256,
        byte_size=len(raw_bytes),
        char_count=len(full_text),
        page_count=page_count,
        document_date=resolved_date,
        sections=sections,
        full_text=full_text,
    )


def extract_document_from_file(
    path: Path,
    title: str | None = None,
    doc_type: str | None = None,
    document_id: str | None = None,
    source_path: str | None = None,
    document_date: str | None = None,
) -> ExtractedDocumentPayload:
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Document file not found: {path}")
    return extract_document_from_bytes(
        raw_bytes=path.read_bytes(),
        filename=path.name,
        title=title,
        doc_type=doc_type,
        document_id=document_id,
        source_path=source_path or path.name,
        document_date=document_date,
    )


def extract_document_from_inline_text(
    text: str,
    filename: str = "inline_document.txt",
    title: str | None = None,
    doc_type: str = "txt",
    document_id: str | None = None,
    document_date: str | None = None,
) -> ExtractedDocumentPayload:
    if not text or not text.strip():
        raise ValueError("Inline document text must be non-empty.")
    ext = Path(filename).suffix.lower() or f".{doc_type.lower().lstrip('.')}"
    safe_name = filename if Path(filename).suffix else f"{filename}{ext}"
    return extract_document_from_bytes(
        raw_bytes=text.encode("utf-8"),
        filename=safe_name,
        title=title,
        doc_type=doc_type,
        document_id=document_id,
        source_path=safe_name,
        document_date=document_date,
    )


def build_text_pdf_bytes(pages: list[str]) -> bytes:
    """Create a standards-compliant extractable PDF (Type1 Helvetica) from plain-text page strings."""
    if not pages:
        raise ValueError("At least one page is required to build a PDF.")

    def _pdf_escape(line: str) -> str:
        ascii_safe = line.encode("latin-1", errors="replace").decode("latin-1")
        return ascii_safe.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    objects: list[bytes] = []

    # 1: Catalog, 2: Pages, 3: Helvetica Font
    num_pages = len(pages)
    page_obj_nums = [4 + i * 2 for i in range(num_pages)]
    kids_ref = " ".join(f"{n} 0 R" for n in page_obj_nums)

    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(f"2 0 obj\n<< /Type /Pages /Kids [{kids_ref}] /Count {num_pages} >>\nendobj\n".encode("latin-1"))
    objects.append(
        b"3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
    )

    for idx, page_text in enumerate(pages):
        page_num = 4 + idx * 2
        content_num = page_num + 1
        lines = [ln.rstrip() for ln in page_text.replace("\r\n", "\n").split("\n")]
        stream_cmds = ["BT", "/F1 10 Tf", "14 TL", "54 750 Td"]
        for line_idx, ln in enumerate(lines):
            escaped = _pdf_escape(ln)
            if line_idx == 0:
                stream_cmds.append(f"({escaped}) Tj")
            else:
                stream_cmds.append(f"T* ({escaped}) Tj")
        stream_cmds.append("ET")
        stream_bytes = "\n".join(stream_cmds).encode("latin-1")

        objects.append(
            f"{page_num} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R >> >> /Contents {content_num} 0 R >>\nendobj\n".encode("latin-1")
        )
        objects.append(
            f"{content_num} 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin-1")
            + stream_bytes
            + b"\nendstream\nendobj\n"
        )

    out = bytearray(b"%PDF-1.4\n")
    offsets: list[int] = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)

    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("latin-1"))
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.extend(
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin-1")
    )
    return bytes(out)

