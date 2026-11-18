"""CORTEX Data Engineering Module.

Provides hybrid data ingestion, validation, and feature preparation pipelines
across DataCo, Olist, and synthetic enterprise procurement streams.
"""

from cortex_intelligence.data_engineering.hybrid_pipeline import HybridDataPipeline

__all__ = ["HybridDataPipeline"]

