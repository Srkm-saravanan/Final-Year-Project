from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class DataOrigin(str, Enum):
    PUBLIC_OPEN_DATASET = "public_open_dataset"
    SYNTHETIC = "synthetic"
    DEMONSTRATION = "demonstration"
    EXTERNAL_RESEARCH = "external_research"
    ENTERPRISE_DOCUMENT = "enterprise_document"


class ProvenanceFields(BaseModel):
    source_dataset: str
    source_record_id: str
    data_origin: DataOrigin
    ingestion_job_id: str


class DepartmentEntity(ProvenanceFields):
    entity_id: str
    department_code: str
    name: str


class ProductCategoryEntity(ProvenanceFields):
    entity_id: str
    category_code: str
    name: str
    department_entity_id: str


class ProductEntity(ProvenanceFields):
    entity_id: str
    product_code: str
    name: str
    unit_price: float
    product_status: str
    category_entity_id: str
    department_entity_id: str


class RegionEntity(ProvenanceFields):
    entity_id: str
    market: str
    region_name: str


class CustomerSegmentEntity(ProvenanceFields):
    entity_id: str
    name: str


class OrderEntity(ProvenanceFields):
    entity_id: str
    order_code: str
    order_date: str
    order_status: str
    payment_type: str
    market: str
    order_region: str
    order_country: str
    order_city: str
    customer_segment_entity_id: str
    region_entity_id: str
    total_sales: float
    total_profit: float
    item_count: int
    has_loss_item: bool = False


class ShipmentEntity(ProvenanceFields):
    """Shipment entity strictly separating pre-shipment features from post-outcome labels."""

    entity_id: str
    shipment_code: str
    order_entity_id: str
    region_entity_id: str
    shipping_mode: str
    # Pre-shipment / planning feature (ML-safe)
    scheduled_shipping_days: int
    # Post-outcome evaluation labels only (must NEVER be used as prediction features)
    eval_real_shipping_days: int
    eval_delivery_status: str
    eval_late_delivery_risk: int
    eval_shipping_date: str | None = None


class OrderContainsProductRel(ProvenanceFields):
    order_entity_id: str
    product_entity_id: str
    quantity: int
    unit_price: float
    discount_rate: float
    sales: float
    order_item_total: float
    profit_per_order: float
    is_profit_outlier: bool = False


class SupplierEntity(ProvenanceFields):
    entity_id: str
    supplier_code: str
    name: str
    tier: str
    home_market: str
    base_lead_time_days: int
    reliability_score: float
    is_synthetic_flagship: bool = False


class SupplierSuppliesProductRel(ProvenanceFields):
    supplier_entity_id: str
    product_entity_id: str
    contract_unit_cost: float
    contract_lead_time_days: int
    is_primary_supplier: bool = True


class WarehouseEntity(ProvenanceFields):
    entity_id: str
    warehouse_code: str
    name: str
    market: str
    region_entity_id: str
    capacity_units: int


class InventoryEntity(ProvenanceFields):
    entity_id: str
    warehouse_entity_id: str
    product_entity_id: str
    on_hand_units: int
    safety_stock_units: int
    reorder_point_units: int
    shortage_units: int
    is_shortage: bool
    last_updated: str


class PurchaseOrderEntity(ProvenanceFields):
    entity_id: str
    po_code: str
    supplier_entity_id: str
    warehouse_entity_id: str
    order_date: str
    expected_delivery_date: str
    scheduled_lead_days: int
    actual_lead_days: int
    delay_days: int
    is_delayed: bool
    delay_severity: str
    delay_cause: str
    status: str
    total_order_cost: float


class PurchaseOrderContainsRel(ProvenanceFields):
    po_entity_id: str
    product_entity_id: str
    ordered_units: int
    unit_cost: float
    line_cost: float


class PurchaseOrderAffectsInventoryRel(ProvenanceFields):
    po_entity_id: str
    inventory_entity_id: str
    projected_shortage_impact_units: int
    delay_days: int


class DocumentEntity(ProvenanceFields):
    entity_id: str
    title: str
    doc_type: str
    source_path: str
    sha256: str
    chunk_count: int


class DocumentChunk(BaseModel):
    chunk_id: str
    document_entity_id: str
    chunk_index: int
    page_or_section: str
    char_start: int
    char_end: int
    text_preview: str
    sha256: str


class DemonstrationNodeEntity(ProvenanceFields):
    entity_id: str
    original_id: str
    label: str
    node_type: str
    category: str
    description: str | None = None


class DemonstrationRel(ProvenanceFields):
    rel_id: str
    source_entity_id: str
    target_entity_id: str
    relationship: str


class DatasetRegistryEntry(BaseModel):
    dataset_id: str
    dataset_name: str
    original_url: str
    doi: str | None = None
    authors_or_publisher: list[str]
    license: str
    version: str
    acquisition_date: str | None = None
    original_filename: str | None = None
    local_relative_path: str | None = None
    file_size_bytes: int | None = None
    sha256_checksum: str | None = None
    data_origin: DataOrigin
    processing_status: str
    notes: str | None = None


class RejectedRecordSample(BaseModel):
    row_number: int
    source_record_id: str
    reason: str
    detail: str


class CleaningStats(BaseModel):
    source_dataset: str
    encoding_used: str
    total_rows_read: int
    accepted_rows: int
    rejected_rows: int
    duplicate_rows_rejected: int = 0
    invalid_identifier_rows: int = 0
    invalid_date_rows: int = 0
    invalid_numeric_rows: int = 0
    whitespace_trimmed_fields: int = 0
    pii_columns_removed: list[str] = Field(default_factory=list)
    undocumented_columns_detected: list[str] = Field(default_factory=list)
    all_null_columns: list[str] = Field(default_factory=list)
    negative_profit_rows: int = 0
    profit_outlier_rows_flagged: int = 0
    rejected_samples: list[RejectedRecordSample] = Field(default_factory=list)


class ExtractedGraphBundle(BaseModel):
    ingestion_job_id: str
    departments: list[DepartmentEntity] = Field(default_factory=list)
    categories: list[ProductCategoryEntity] = Field(default_factory=list)
    products: list[ProductEntity] = Field(default_factory=list)
    regions: list[RegionEntity] = Field(default_factory=list)
    customer_segments: list[CustomerSegmentEntity] = Field(default_factory=list)
    orders: list[OrderEntity] = Field(default_factory=list)
    shipments: list[ShipmentEntity] = Field(default_factory=list)
    order_items: list[OrderContainsProductRel] = Field(default_factory=list)
    suppliers: list[SupplierEntity] = Field(default_factory=list)
    supplier_products: list[SupplierSuppliesProductRel] = Field(default_factory=list)
    warehouses: list[WarehouseEntity] = Field(default_factory=list)
    inventory: list[InventoryEntity] = Field(default_factory=list)
    purchase_orders: list[PurchaseOrderEntity] = Field(default_factory=list)
    po_items: list[PurchaseOrderContainsRel] = Field(default_factory=list)
    po_inventory_impacts: list[PurchaseOrderAffectsInventoryRel] = Field(default_factory=list)
    documents: list[DocumentEntity] = Field(default_factory=list)
    document_chunks: list[DocumentChunk] = Field(default_factory=list)
    demo_nodes: list[DemonstrationNodeEntity] = Field(default_factory=list)
    demo_rels: list[DemonstrationRel] = Field(default_factory=list)

    def entity_counts(self) -> dict[str, int]:
        return {
            "Department": len(self.departments),
            "ProductCategory": len(self.categories),
            "Product": len(self.products),
            "Region": len(self.regions),
            "CustomerSegment": len(self.customer_segments),
            "Order": len(self.orders),
            "Shipment": len(self.shipments),
            "Supplier": len(self.suppliers),
            "Warehouse": len(self.warehouses),
            "Inventory": len(self.inventory),
            "PurchaseOrder": len(self.purchase_orders),
            "Document": len(self.documents),
            "DemoEntity": len(self.demo_nodes),
        }


class IngestionJobRecord(BaseModel):
    job_id: str
    mode: str
    status: str
    started_at: str
    completed_at: str | None = None
    source_path: str
    neo4j_ingested: bool = False
    cleaning_stats: CleaningStats | None = None
    entity_counts: dict[str, int] = Field(default_factory=dict)
    relationship_counts: dict[str, int] = Field(default_factory=dict)
    neo4j_write_summary: dict[str, Any] = Field(default_factory=dict)
    error_message: str | None = None


def utc_now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

