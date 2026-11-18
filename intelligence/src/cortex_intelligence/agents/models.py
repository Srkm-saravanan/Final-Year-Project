from __future__ import annotations

from enum import Enum
from typing import Any, Literal
from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class AgentRole(str, Enum):
    """The five canonical decision intelligence roles."""

    FINANCE = "finance"
    OPERATIONS = "operations"
    MARKETING = "marketing"
    RISK = "risk"
    STRATEGY_SUPERVISOR = "strategy_supervisor"


class AgentFactualClaim(BaseModel):
    """An individual grounded claim referencing supporting evidence."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    claim: str = Field(description="Factual claim or quantitative assertion.")
    evidence_reference: str = Field(
        description="ID of DocumentChunk, Neo4j Entity, or Citation ID supporting the claim.",
        validation_alias=AliasChoices("evidence_reference", "evidenceReference", "source", "citation"),
    )
    confidence: float = Field(
        default=0.85,
        description="Confidence level between 0.0 and 1.0.",
    )

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
                return 0.9 if "high" in lower else (0.6 if "med" in lower else 0.4)
        return float(v)


class SpecialistFinding(BaseModel):
    """Structured assessment produced by a domain specialist agent."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    agent_role: AgentRole = Field(description="Role of authoring agent.")
    agent_name: str = Field(description="Display name of authoring agent.")
    key_analysis: str = Field(
        description="In-depth domain perspective on the business situation.",
        validation_alias=AliasChoices("key_analysis", "keyAnalysis", "analysis"),
    )
    quantitative_estimates: dict[str, Any] = Field(
        default_factory=dict,
        description="Domain-specific metrics (costs, inventory units, orders, margins).",
        validation_alias=AliasChoices("quantitative_estimates", "quantitativeEstimates", "metrics"),
    )
    grounded_claims: list[AgentFactualClaim] = Field(
        default_factory=list,
        description="Specific claims tied to verifiable evidence IDs.",
        validation_alias=AliasChoices("grounded_claims", "groundedClaims", "claims"),
    )
    concerns_or_limitations: list[str] = Field(
        default_factory=list,
        description="Critical vulnerabilities, missing evidence, or assumptions identified.",
        validation_alias=AliasChoices("concerns_or_limitations", "concernsOrLimitations", "concerns", "limitations"),
    )
    recommendation_stance: Literal["SUPPORT", "OBJECT", "CONDITIONAL", "DEFER"] = Field(
        default="CONDITIONAL",
        description="Domain stance towards proposed action.",
        validation_alias=AliasChoices("recommendation_stance", "recommendationStance", "stance"),
    )
    confidence: float = Field(
        default=0.8,
        description="Confidence between 0.0 and 1.0.",
    )

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

    @field_validator("recommendation_stance", mode="before")
    @classmethod
    def normalize_stance(cls, v: Any) -> str:
        if isinstance(v, str):
            upper = v.upper().strip()
            if "APPROV" in upper or "SUPPORT" in upper or "PROCEED" in upper:
                return "SUPPORT"
            if "REJECT" in upper or "OBJECT" in upper or "DENY" in upper:
                return "OBJECT"
            if "DEFER" in upper or "INCONCLUSIVE" in upper or "UNCERTAIN" in upper:
                return "DEFER"
            return "CONDITIONAL"
        return "CONDITIONAL"


class RiskChallenge(BaseModel):
    """An explicit critique by the Risk Agent challenging an earlier agent's assertion."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    target_agent: AgentRole = Field(
        description="Role of the agent being challenged.",
        validation_alias=AliasChoices("target_agent", "targetAgent", "agent"),
    )
    challenge_point: str = Field(
        description="Specific assertion, assumption, or metric being challenged.",
        validation_alias=AliasChoices("challenge_point", "challengePoint", "point"),
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = Field(
        default="MEDIUM",
        description="Severity of the identified vulnerability.",
    )
    missing_evidence: list[str] = Field(
        default_factory=list,
        description="Evidence or verifiable data that is absent or unverified.",
        validation_alias=AliasChoices("missing_evidence", "missingEvidence"),
    )

    @field_validator("severity", mode="before")
    @classmethod
    def normalize_severity(cls, v: Any) -> str:
        if isinstance(v, str):
            upper = v.upper().strip()
            if "CRIT" in upper:
                return "CRITICAL"
            if "HIGH" in upper:
                return "HIGH"
            if "LOW" in upper:
                return "LOW"
            return "MEDIUM"
        return "MEDIUM"


class RiskAssessment(SpecialistFinding):
    """Specialized assessment produced by the Risk Agent containing cross-agent challenges."""

    challenges_to_previous_findings: list[RiskChallenge] = Field(
        default_factory=list,
        description="Challenges raised against Finance, Operations, or Marketing assumptions.",
        validation_alias=AliasChoices(
            "challenges_to_previous_findings",
            "challengesToPreviousFindings",
            "challenges",
        ),
    )
    downside_vulnerability: str = Field(
        default="Moderate operational vulnerability.",
        validation_alias=AliasChoices("downside_vulnerability", "downsideVulnerability"),
    )
    worst_case_exposure: str = Field(
        default="Potential localized shipment delay.",
        validation_alias=AliasChoices("worst_case_exposure", "worstCaseExposure"),
    )


class ConsolidatedDecision(BaseModel):
    """The final executive decision synthesized by the Strategy Supervisor."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    decision_title: str = Field(
        description="Concise strategic decision headline.",
        validation_alias=AliasChoices("decision_title", "decisionTitle", "title"),
    )
    final_stance: Literal["APPROVE", "REJECT", "CONDITIONALLY_APPROVE", "DEFER"] = Field(
        default="CONDITIONALLY_APPROVE",
        description="Definitive organizational verdict.",
        validation_alias=AliasChoices("final_stance", "finalStance", "verdict", "decision"),
    )
    confidence: float = Field(
        default=0.85,
        description="Consensus confidence between 0.0 and 1.0.",
    )
    executive_summary: str = Field(
        description="Comprehensive executive briefing synthesizing all specialist arguments.",
        validation_alias=AliasChoices("executive_summary", "executiveSummary", "summary"),
    )
    consensus_points: list[str] = Field(
        default_factory=list,
        description="Areas where all specialists agree.",
        validation_alias=AliasChoices("consensus_points", "consensusPoints", "consensus"),
    )
    unresolved_disagreements: list[str] = Field(
        default_factory=list,
        description="Trade-offs or conflicts identified between domain agents.",
        validation_alias=AliasChoices(
            "unresolved_disagreements",
            "unresolvedDisagreements",
            "disagreements",
            "conflicts",
        ),
    )
    action_plan: list[str] = Field(
        default_factory=list,
        description="Prioritized execution steps.",
        validation_alias=AliasChoices("action_plan", "actionPlan", "actions"),
    )
    guardrail_conditions: list[str] = Field(
        default_factory=list,
        description="Preconditions or stopping criteria for execution.",
        validation_alias=AliasChoices("guardrail_conditions", "guardrailConditions", "guardrails"),
    )
    citations_used: list[str] = Field(
        default_factory=list,
        description="Cited evidence IDs validating the final decision.",
        validation_alias=AliasChoices("citations_used", "citationsUsed", "citations"),
    )
    evidence_sufficiency: Literal["SUFFICIENT", "PARTIAL", "INSUFFICIENT"] = Field(
        default="SUFFICIENT",
        description="Assessment of evidence backing the decision.",
        validation_alias=AliasChoices("evidence_sufficiency", "evidenceSufficiency"),
    )

    @field_validator("final_stance", mode="before")
    @classmethod
    def normalize_final_stance(cls, v: Any) -> str:
        if isinstance(v, str):
            upper = v.upper().strip()
            if "APPROV" in upper and "COND" not in upper:
                return "APPROVE"
            if "REJECT" in upper or "DENY" in upper:
                return "REJECT"
            if "DEFER" in upper or "INCONCLUSIVE" in upper:
                return "DEFER"
            return "CONDITIONALLY_APPROVE"
        return "CONDITIONALLY_APPROVE"

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


class DeliberationState(BaseModel):
    """The shared state object through which all 5 agents communicate sequentially."""

    model_config = ConfigDict(extra="ignore")

    session_id: str
    user_query: str
    as_of_date: str = "2026-11-12"
    created_at: str
    completed_at: str | None = None
    status: Literal["PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"] = "PENDING"

    # Evidence Context
    graphrag_evidence: dict[str, Any] = Field(default_factory=dict)
    retrieved_chunk_count: int = 0
    retrieved_graph_path_count: int = 0
    insufficient_evidence_flag: bool = False

    # Specialist Findings
    finance_finding: SpecialistFinding | None = None
    operations_finding: SpecialistFinding | None = None
    marketing_finding: SpecialistFinding | None = None
    risk_assessment: RiskAssessment | None = None
    supervisor_decision: ConsolidatedDecision | None = None

    # Telemetry
    execution_order: list[AgentRole] = Field(default_factory=list)
    agent_latencies_ms: dict[str, float] = Field(default_factory=dict)
    total_eval_tokens: int = 0
    errors: list[str] = Field(default_factory=list)


class DeliberationRequest(BaseModel):
    """API payload to initiate a full 5-agent deliberation session."""

    query: str = Field(min_length=2, max_length=2000, description="Business dilemma or decision query.")
    as_of_date: str = Field(default="2026-11-12", description="Reference date for temporal filtering.")
    include_demonstration: bool = Field(default=False, description="Whether to include demonstration data.")
    temporal_mode: Literal["scenario_aware", "strict_active", "historical_all"] = Field(
        default="scenario_aware",
        description="Temporal filtering rule for DataCo orders vs synthetic scenario.",
    )
    top_k: int = Field(default=6, ge=1, le=20, description="Number of evidence chunks to retrieve.")

