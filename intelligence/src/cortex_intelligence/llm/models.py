from __future__ import annotations

from enum import Enum
from typing import Any, Generic, TypeVar
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

T = TypeVar("T", bound=BaseModel)


class ChatRole(str, Enum):
    """Supported roles in Ollama chat completion API."""

    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"


class ChatMessage(BaseModel):
    """Individual chat message adhering to the ChatML standard."""

    model_config = ConfigDict(extra="ignore")

    role: ChatRole
    content: str


class OllamaModelOptions(BaseModel):
    """Runtime generation parameters sent to Ollama."""

    model_config = ConfigDict(extra="ignore")

    num_ctx: int = Field(default=4096, description="Context window ceiling in tokens.")
    temperature: float = Field(default=0.2, description="Sampling temperature.")
    top_p: float = Field(default=0.9, description="Nucleus sampling threshold.")
    top_k: int = Field(default=40, description="Top-k sampling threshold.")


class OllamaChatRequest(BaseModel):
    """Wire payload sent to POST /api/chat."""

    model_config = ConfigDict(extra="ignore")

    model: str
    messages: list[ChatMessage]
    format: str | None = Field(default=None, description="Set to 'json' to enforce JSON mode.")
    stream: bool = Field(default=False, description="Streaming is false for deterministic batch calls.")
    options: OllamaModelOptions = Field(default_factory=OllamaModelOptions)


OllamaChatPayload = OllamaChatRequest


class OllamaMessageResponse(BaseModel):
    """Assistant message body returned by Ollama."""

    model_config = ConfigDict(extra="ignore")

    role: str
    content: str


class OllamaChatResponse(BaseModel):
    """Full response envelope from POST /api/chat."""

    model_config = ConfigDict(extra="ignore")

    model: str
    message: OllamaMessageResponse
    done: bool = True
    total_duration: int | None = Field(default=None, description="Total nanoseconds.")
    load_duration: int | None = Field(default=None, description="Model load nanoseconds.")
    prompt_eval_count: int | None = Field(default=None, description="Prompt tokens.")
    prompt_eval_duration: int | None = Field(default=None, description="Prompt eval nanoseconds.")
    eval_count: int | None = Field(default=None, description="Generated tokens.")
    eval_duration: int | None = Field(default=None, description="Generation nanoseconds.")


class OllamaConnectivityStatus(BaseModel):
    """Health check and model readiness telemetry."""

    model_config = ConfigDict(extra="ignore")

    connected: bool
    base_url: str
    target_model: str
    model_available: bool
    available_models: list[str] = Field(default_factory=list)
    latency_ms: float | None = None
    context_limit: int = 4096
    error: str | None = None


class StructuredGenerationResult(BaseModel, Generic[T]):
    """Wrapper holding validated typed Pydantic models alongside generation metadata."""

    model_config = ConfigDict(extra="ignore")

    success: bool
    data: T | None = None
    raw_content: str
    error: str | None = None
    eval_tokens: int | None = None
    latency_ms: float | None = None
    attempts: int = 1


# --- Reference Domain Schemas for Testing & Decision Validation ---

class DecisionFactor(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    factor_name: str = Field(validation_alias=AliasChoices("factor_name", "factorName", "name"))
    impact_level: str = Field(default="Medium", description="Low | Medium | High | Critical", validation_alias=AliasChoices("impact_level", "impactLevel", "impact"))
    description: str = Field(default="", validation_alias=AliasChoices("description", "desc"))


class DecisionInsightSchema(BaseModel):
    """Standardized decision summary schema for Phase 1 verification."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    decision_summary: str = Field(validation_alias=AliasChoices("decision_summary", "decisionSummary", "summary"))
    recommendation: str = Field(description="Approve | Reject | Conditionally Approve | Escalate")
    confidence: float = Field(description="Confidence between 0.0 and 1.0 (or 0 to 100 percentage)")
    key_factors: list[DecisionFactor] = Field(default_factory=list, validation_alias=AliasChoices("key_factors", "keyFactors", "factors"))
    risk_assessment: str = Field(validation_alias=AliasChoices("risk_assessment", "riskAssessment", "risks"))

    @field_validator("confidence", mode="before")
    @classmethod
    def normalize_confidence(cls, v: Any) -> float:
        if isinstance(v, (int, float)) and v > 1.0:
            return float(v / 100.0)
        if isinstance(v, str):
            v_clean = v.replace("%", "").strip()
            try:
                val = float(v_clean)
                return float(val / 100.0 if val > 1.0 else val)
            except ValueError:
                lower = v.lower()
                return 0.85 if "high" in lower else (0.65 if "med" in lower else 0.5)
        return float(v)

    @field_validator("key_factors", mode="before")
    @classmethod
    def normalize_factors(cls, v: Any) -> list[Any]:
        if not isinstance(v, list):
            return []
        normalized: list[Any] = []
        for item in v:
            if isinstance(item, str):
                normalized.append(DecisionFactor(factor_name=item, impact_level="Medium", description=item))
            elif isinstance(item, dict):
                normalized.append(item)
            elif isinstance(item, DecisionFactor):
                normalized.append(item)
        return normalized
