from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol

import httpx

_WORD_OR_CODE_RE = re.compile(r"[A-Za-z0-9]+(?:[-_:][A-Za-z0-9]+)*")
_CODE_TOKEN_RE = re.compile(r"\b(?:SYN|DATACO|DEMO|DOC)[-_:]?[A-Z0-9:-]+\b", re.IGNORECASE)

_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
    "in", "is", "it", "its", "of", "on", "or", "that", "the", "to", "was", "were",
    "which", "will", "with", "this", "these", "those", "could", "would", "if",
}

# Explicit semantic concept buckets (mapped to dedicated dense dimensions) so
# related enterprise/supply-chain concepts share strong cosine similarity.
_CONCEPT_CLUSTERS: tuple[tuple[str, ...], ...] = (
    ("delay", "late", "backlog", "bottleneck", "congestion", "customs", "hold", "slippage", "overdue", "disrupt", "disruption"),
    ("shortage", "stockout", "deficit", "safety", "safeti", "safety_stock", "buffer", "reorder", "depleted", "low_inventory", "exposure"),
    ("supplier", "vendor", "procurement", "sourcing", "manufacturer", "tier", "tier-1", "tier-2", "tier-3", "contract"),
    ("purchase", "purchase_order", "po", "replenish", "replenishment", "lead_time", "lead", "scheduled", "fulfillment"),
    ("warehouse", "hub", "depot", "facility", "storage", "stored", "destination", "distribution", "inventory"),
    ("product", "sku", "item", "catalog", "merchandise", "category", "department"),
    ("order", "orders", "customer", "shipment", "shipping", "delivery", "deliver", "carrier", "transit"),
    ("revenue", "sales", "profit", "margin", "cost", "usd", "financial", "impact", "value"),
    ("risk", "critical", "high", "severity", "mitigate", "mitigation", "expedite", "reroute", "escalation", "air_freight"),
    ("synthetic", "scenario", "simulated", "simulation", "counterfactual", "modeled"),
    ("historical", "dataco", "baseline", "archive", "benchmark", "2015", "2016", "2017", "2018", "temporal"),
    ("demonstration", "demo", "mock", "illustrative", "sample"),
    ("provenance", "audit", "traceable", "lineage", "origin", "citation", "evidence"),
    ("usca", "north_america", "america", "west", "east", "california"),
    ("europe", "eu", "central", "south", "emea"),
    ("latam", "latin", "mexico", "brazil", "caribbean"),
    ("apac", "pacific", "asia", "pacific_asia"),
    ("africa", "mena", "north_africa"),
)


def _stem_token(tok: str) -> str:
    t = tok.lower()
    if len(t) <= 3 or "-" in t or ":" in t:
        return t
    for suffix in ("ation", "ment", "ness", "ing", "ied", "ies", "ed", "es", "s"):
        if len(t) > len(suffix) + 3 and t.endswith(suffix):
            if suffix in ("ies", "ied"):
                return t[: -len(suffix)] + "y"
            return t[: -len(suffix)]
    return t


def _signed_hash_index(feature: str, bucket_count: int) -> tuple[int, float]:
    digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
    raw = int.from_bytes(digest, "big")
    idx = raw % bucket_count
    sign = 1.0 if ((raw >> 63) & 1) == 0 else -1.0
    return idx, sign


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return float(dot / (norm_a * norm_b))


class EmbeddingProvider(Protocol):
    model_name: str
    dimensions: int

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        ...

    def embed_query(self, query: str) -> list[float]:
        ...


class LocalSemanticEmbeddingProvider:
    """Deterministic, zero-dependency 512-dim L2-normalized semantic + lexical embedding model."""

    def __init__(
        self,
        dimensions: int = 512,
        model_name: str = "cortex-local-semantic-512-v1",
    ) -> None:
        if dimensions < 128:
            raise ValueError("Embedding dimensions must be at least 128.")
        self.dimensions = dimensions
        self.model_name = model_name
        self._concept_slots = min(64, max(24, len(_CONCEPT_CLUSTERS) * 2))
        self._hash_dims = self.dimensions - self._concept_slots

        self._concept_lookup: dict[str, int] = {}
        for cluster_idx, terms in enumerate(_CONCEPT_CLUSTERS):
            for term in terms:
                self._concept_lookup[term] = cluster_idx
                self._concept_lookup[_stem_token(term)] = cluster_idx

    def _embed_single(self, text: str) -> list[float]:
        vec = [0.0] * self.dimensions
        raw_tokens = _WORD_OR_CODE_RE.findall(text.lower())
        if not raw_tokens:
            vec[0] = 1.0
            return vec

        tf_counts: dict[str, int] = {}
        stemmed_seq: list[str] = []

        for tok in raw_tokens:
            if tok in _STOPWORDS:
                continue
            stemmed = _stem_token(tok)
            stemmed_seq.append(stemmed)
            tf_counts[f"w:{stemmed}"] = tf_counts.get(f"w:{stemmed}", 0) + 1
            if "-" in tok or ":" in tok or "_" in tok:
                tf_counts[f"code:{tok}"] = tf_counts.get(f"code:{tok}", 0) + 2

        for code_match in _CODE_TOKEN_RE.findall(text):
            norm_code = code_match.lower()
            tf_counts[f"code:{norm_code}"] = tf_counts.get(f"code:{norm_code}", 0) + 3

        for i in range(len(stemmed_seq) - 1):
            bg = f"bg:{stemmed_seq[i]}_{stemmed_seq[i + 1]}"
            tf_counts[bg] = tf_counts.get(bg, 0) + 1

        # Character 3-grams and 4-grams capture morphology and SKU/entity subwords
        for tok in stemmed_seq:
            if len(tok) >= 4:
                padded = f"<{tok}>"
                for n in (3, 4):
                    for j in range(0, len(padded) - n + 1):
                        cg = f"c{n}:{padded[j:j+n]}"
                        tf_counts[cg] = tf_counts.get(cg, 0) + 1

        for feat, cnt in tf_counts.items():
            weight = 1.0 + math.log1p(cnt)
            if feat.startswith("code:"):
                weight *= 2.4
            elif feat.startswith("w:"):
                weight *= 1.4
            elif feat.startswith("bg:"):
                weight *= 1.15
            else:
                weight *= 0.35
            idx, sign = _signed_hash_index(feat, self._hash_dims)
            vec[idx] += sign * weight

        # Activate concept slots in [hash_dims .. dimensions)
        for feat, cnt in tf_counts.items():
            base = feat.split(":", 1)[1]
            c_idx = self._concept_lookup.get(base)
            if c_idx is not None:
                slot = self._hash_dims + (c_idx % self._concept_slots)
                vec[slot] += (1.0 + math.log1p(cnt)) * 1.8

        norm = math.sqrt(sum(v * v for v in vec))
        if norm == 0.0:
            vec[0] = 1.0
            return vec
        return [round(v / norm, 6) for v in vec]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._embed_single(t) for t in texts]

    def embed_query(self, query: str) -> list[float]:
        return self._embed_single(query)


class GeminiEmbeddingProvider:
    """Optional Google Gemini REST embedding provider when a live GEMINI_API_KEY is explicitly configured."""

    def __init__(
        self,
        api_key: str,
        dimensions: int = 512,
        model_name: str = "models/text-embedding-004",
        timeout_seconds: float = 15.0,
    ) -> None:
        self.api_key = api_key.strip()
        if not self.api_key:
            raise ValueError("A non-empty GEMINI_API_KEY is required for GeminiEmbeddingProvider.")
        self.dimensions = dimensions
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds

    def _call_embed(self, text: str, task_type: str) -> list[float]:
        url = f"https://generativelanguage.googleapis.com/v1beta/{self.model_name}:embedContent"
        resp = httpx.post(
            url,
            params={"key": self.api_key},
            json={
                "model": self.model_name,
                "content": {"parts": [{"text": text}]},
                "taskType": task_type,
                "outputDimensionality": self.dimensions,
            },
            timeout=self.timeout_seconds,
        )
        resp.raise_for_status()
        values = resp.json().get("embedding", {}).get("values", [])
        if len(values) != self.dimensions:
            raise RuntimeError(
                f"Expected {self.dimensions}-dim Gemini embedding, got {len(values)}."
            )
        norm = math.sqrt(sum(v * v for v in values)) or 1.0
        return [float(v / norm) for v in values]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._call_embed(t, "RETRIEVAL_DOCUMENT") for t in texts]

    def embed_query(self, query: str) -> list[float]:
        return self._call_embed(query, "RETRIEVAL_QUERY")


def build_embedding_provider(
    provider_name: str = "local",
    dimensions: int = 512,
    model_name: str = "cortex-local-semantic-512-v1",
    gemini_api_key: str = "",
) -> EmbeddingProvider:
    if provider_name.lower() == "gemini" and gemini_api_key.strip():
        return GeminiEmbeddingProvider(
            api_key=gemini_api_key,
            dimensions=dimensions,
            model_name=model_name if model_name.startswith("models/") else "models/text-embedding-004",
        )
    return LocalSemanticEmbeddingProvider(dimensions=dimensions, model_name=model_name)

