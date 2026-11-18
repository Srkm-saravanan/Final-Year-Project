from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from cortex_intelligence.models.canonical import DataOrigin


class ExtractedSection(BaseModel):
    page_number: int | None = None
    section_title: str | None = None
    page_or_section: str
    text: str


class ExtractedDocumentPayload(BaseModel):
    document_entity_id: str
    title: str
    filename: str
    doc_type: str
    source_path: str
    sha256: str
    byte_size: int
    char_count: int
    page_count: int | None = None
    document_date: str | None = None
    sections: list[ExtractedSection] = Field(default_factory=list)
    full_text: str


class ChunkRecord(BaseModel):
    entity_id: str
    chunk_id: str
    document_entity_id: str
    chunk_index: int
    page_number: int | None = None
    section_title: str | None = None
    page_or_section: str
    char_start: int
    char_end: int
    token_count: int
    text: str
    text_preview: str
    sha256: str
    document_date: str | None = None
    embedding: list[float] = Field(default_factory=list)
    embedding_model: str = "cortex-local-semantic-512-v1"
    embedding_dimensions: int = 512
    source_dataset: str
    source_record_id: str
    data_origin: DataOrigin
    ingestion_job_id: str


class EntityCatalogEntry(BaseModel):
    entity_id: str
    labels: list[str]
    display_name: str
    code: str | None = None
    aliases: list[str] = Field(default_factory=list)
    data_origin: DataOrigin | str


class EntityLinkRecord(BaseModel):
    chunk_entity_id: str
    target_entity_id: str
    target_labels: list[str] = Field(default_factory=list)
    target_display_name: str
    target_data_origin: str
    confidence: float = Field(ge=0.0, le=1.0)
    match_type: Literal[
        "exact_entity_id",
        "exact_code",
        "exact_name",
        "alias_or_partial_phrase",
    ]
    matched_text: str
    evidence_excerpt: str
    char_start: int
    char_end: int
    source_dataset: str
    source_record_id: str
    data_origin: DataOrigin
    ingestion_job_id: str


class DocumentSummary(BaseModel):
    entity_id: str
    title: str
    doc_type: str
    source_path: str
    sha256: str
    chunk_count: int
    linked_entity_count: int = 0
    page_count: int | None = None
    document_date: str | None = None
    embedding_model: str | None = None
    data_origin: str
    source_dataset: str
    ingestion_job_id: str
    updated_at: str | None = None


class ChunkInspectionRecord(BaseModel):
    entity_id: str
    chunk_id: str
    document_entity_id: str
    document_title: str | None = None
    chunk_index: int
    page_number: int | None = None
    section_title: str | None = None
    page_or_section: str
    char_start: int
    char_end: int
    token_count: int
    text: str
    text_preview: str
    sha256: str
    document_date: str | None = None
    embedding_model: str | None = None
    embedding_dimensions: int | None = None
    data_origin: str
    source_dataset: str
    source_record_id: str
    ingestion_job_id: str
    linked_entities: list[dict[str, Any]] = Field(default_factory=list)


class GraphPathHop(BaseModel):
    from_entity_id: str
    from_labels: list[str]
    from_name: str
    from_origin: str
    relationship_type: str
    relationship_props: dict[str, Any] = Field(default_factory=dict)
    to_entity_id: str
    to_labels: list[str]
    to_name: str
    to_origin: str


class GraphPathRecord(BaseModel):
    path_id: str
    summary: str
    hops: list[GraphPathHop] = Field(default_factory=list)
    data_origins: list[str] = Field(default_factory=list)
    temporal_window: str | None = None
    is_synthetic_scenario: bool = False
    is_historical_baseline: bool = False
    is_demonstration: bool = False


class RetrievedChunkEvidence(BaseModel):
    rank: int
    entity_id: str
    chunk_id: str
    document_entity_id: str
    document_title: str
    doc_type: str
    data_origin: str
    document_date: str | None = None
    page_or_section: str
    page_number: int | None = None
    section_title: str | None = None
    text: str
    text_preview: str
    vector_score: float = 0.0
    keyword_score: float = 0.0
    graph_boost_score: float = 0.0
    rrf_score: float = 0.0
    retrieval_channels: list[str] = Field(default_factory=list)
    linked_entities: list[dict[str, Any]] = Field(default_factory=list)
    source_dataset: str = ""
    source_record_id: str = ""


class TemporalFilterSummary(BaseModel):
    mode: Literal["scenario_aware", "strict_active", "historical_all"]
    as_of_date: str
    scenario_window_start: str | None = None
    scenario_window_end: str | None = None
    order_start_date: str | None = None
    order_end_date: str | None = None
    historical_orders_excluded_from_active_count: int = 0
    overlapping_window_orders_count: int = 0
    current_real_world_orders_count: int = 0
    temporal_guardrail_applied: bool = True
    explanation: str


class OriginSeparatedEvidence(BaseModel):
    public_historical_dataco: dict[str, Any] = Field(default_factory=dict)
    synthetic_scenario: dict[str, Any] = Field(default_factory=dict)
    enterprise_documents: dict[str, Any] = Field(default_factory=dict)
    demonstration: dict[str, Any] = Field(default_factory=dict)


class CitationRecord(BaseModel):
    citation_id: str
    source_type: Literal["document_chunk", "neo4j_graph_path", "neo4j_entity"]
    data_origin: str
    title: str
    document_entity_id: str | None = None
    chunk_id: str | None = None
    page_or_section: str | None = None
    excerpt: str
    entity_ids: list[str] = Field(default_factory=list)
    confidence: float | None = None
    temporal_window: str | None = None


class DocumentIngestRequest(BaseModel):
    file_path: str | None = Field(default=None, max_length=400)
    text: str | None = Field(default=None, max_length=2_000_000)
    filename: str | None = Field(default=None, max_length=200)
    title: str | None = Field(default=None, max_length=300)
    doc_type: str | None = Field(default=None, max_length=50)
    document_id: str | None = Field(default=None, max_length=150)
    document_date: str | None = Field(default=None, max_length=40)
    data_origin: DataOrigin = DataOrigin.ENTERPRISE_DOCUMENT
    chunk_size: int | None = Field(default=None, ge=200, le=4000)
    chunk_overlap: int | None = Field(default=None, ge=0, le=1000)


class DocumentIngestResult(BaseModel):
    job_id: str
    document: DocumentSummary
    chunks_indexed: int
    entity_links_created: int
    embedding_model: str
    embedding_dimensions: int
    sample_entity_links: list[EntityLinkRecord] = Field(default_factory=list)


class GraphRAGRetrieveRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    top_k: int = Field(default=6, ge=1, le=25)
    max_hops: int = Field(default=4, ge=1, le=6)
    include_demonstration: bool = False
    temporal_mode: Literal["scenario_aware", "strict_active", "historical_all"] = "scenario_aware"
    as_of_date: str = Field(default="2026-11-12", max_length=40)
    order_start_date: str | None = Field(default=None, max_length=40)
    order_end_date: str | None = Field(default=None, max_length=40)
    data_origins: list[str] | None = None


class GraphRAGRetrievalResult(BaseModel):
    query: str
    retrieval_channels_used: list[str] = Field(default_factory=list)
    matched_entities: list[dict[str, Any]] = Field(default_factory=list)
    chunks: list[RetrievedChunkEvidence] = Field(default_factory=list)
    graph_paths: list[GraphPathRecord] = Field(default_factory=list)
    temporal_filter: TemporalFilterSummary
    origin_evidence: OriginSeparatedEvidence


class GraphRAGQueryRequest(GraphRAGRetrieveRequest):
    include_retrieval_debug: bool = True


class GraphRAGAnswerResponse(BaseModel):
    query: str
    answer_markdown: str
    insufficient_evidence: bool = False
    grounded_claims_count: int = 0
    citations: list[CitationRecord] = Field(default_factory=list)
    graph_paths: list[GraphPathRecord] = Field(default_factory=list)
    temporal_filter: TemporalFilterSummary
    origin_evidence: OriginSeparatedEvidence
    retrieval: GraphRAGRetrievalResult | None = None

