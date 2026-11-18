from __future__ import annotations

import json
import re
from typing import Type
from pydantic import BaseModel


def clean_json_text(raw_text: str) -> str:
    """Strip markdown code fence blocks, leading commentary, and trailing whitespace from JSON text."""
    trimmed = raw_text.strip()
    # Match ```json ... ``` or ``` ... ```
    m = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", trimmed, re.IGNORECASE)
    if m:
        trimmed = m.group(1).strip()
    # If there are leading non-bracket characters before the first { or [, slice to it
    first_bracket = min(
        [pos for pos in (trimmed.find("{"), trimmed.find("[")) if pos != -1],
        default=-1,
    )
    if first_bracket > 0:
        trimmed = trimmed[first_bracket:]

    # If there are trailing characters after the last } or ], slice to it
    last_bracket = max(trimmed.rfind("}"), trimmed.rfind("]"))
    if last_bracket != -1 and last_bracket < len(trimmed) - 1:
        trimmed = trimmed[: last_bracket + 1]

    return trimmed


def build_system_prompt_with_json_schema(
    system_instruction: str,
    schema_class: Type[BaseModel],
) -> str:
    """Format system prompt with explicit JSON schema and zero-prose enforcement."""
    schema_json = json.dumps(schema_class.model_json_schema(), indent=2)
    return (
        f"{system_instruction.strip()}\n\n"
        "### STRICT OUTPUT FORMAT INSTRUCTIONS\n"
        "You must respond ONLY with a valid JSON object matching the following JSON Schema.\n"
        "Do NOT include any markdown formatting, preamble, explanations, or commentary outside the JSON.\n\n"
        f"```json\n{schema_json}\n```\n"
    )


DECISION_ANALYST_SYSTEM_PROMPT = (
    "You are CORTEX Executive Decision Analyst, an expert enterprise decision intelligence system. "
    "Your responsibility is to analyze business dilemmas, supplier bottlenecks, and risk exposures, "
    "providing strictly evidence-grounded, structured recommendations."
)

GOVERNANCE_SYSTEM_PROMPT = (
    "You are CORTEX Governance & Compliance Intelligence, responsible for auditing executive proposals, "
    "evaluating single-points-of-failure, assessing financial exposure bounds, and ensuring strict adherence "
    "to organizational policies."
)

