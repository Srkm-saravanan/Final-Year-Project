from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from cortex_intelligence.api.dependencies import (
    get_app_settings,
    get_ollama_client,
    require_service_key,
)
from cortex_intelligence.config import Settings
from cortex_intelligence.llm.client import OllamaClient
from cortex_intelligence.llm.exceptions import (
    OllamaConnectionError,
    OllamaError,
    OllamaTimeoutError,
)
from cortex_intelligence.llm.models import (
    ChatMessage,
    ChatRole,
    DecisionInsightSchema,
    OllamaChatResponse,
    OllamaConnectivityStatus,
)
from cortex_intelligence.llm.prompts import DECISION_ANALYST_SYSTEM_PROMPT

router = APIRouter(
    prefix="/api/v1/llm",
    tags=["Local LLM"],
    dependencies=[Depends(require_service_key)],
)


class TestChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=10000)
    system_prompt: str | None = Field(default=None)
    temperature: float | None = Field(default=None, ge=0.0, le=1.0)


class TestStructuredRequest(BaseModel):
    query: str = Field(min_length=1, max_length=10000)
    system_instruction: str | None = Field(default=DECISION_ANALYST_SYSTEM_PROMPT)
    temperature: float | None = Field(default=None, ge=0.0, le=1.0)


@router.get("/connectivity", response_model=dict[str, Any])
async def check_llm_connectivity(
    ollama_client: OllamaClient = Depends(get_ollama_client),
) -> dict[str, Any]:
    """Test and verify connectivity to the local Ollama LLM service."""
    status_info: OllamaConnectivityStatus = await ollama_client.check_connectivity()
    return {
        "success": True,
        "data": status_info.model_dump(),
        "error": None,
    }


@router.post("/chat", response_model=dict[str, Any])
async def test_chat_generation(
    payload: TestChatRequest,
    ollama_client: OllamaClient = Depends(get_ollama_client),
) -> dict[str, Any]:
    """Execute raw conversational turn against the local Ollama model."""
    messages: list[ChatMessage] = []
    if payload.system_prompt:
        messages.append(ChatMessage(role=ChatRole.SYSTEM, content=payload.system_prompt))
    messages.append(ChatMessage(role=ChatRole.USER, content=payload.prompt))

    try:
        response: OllamaChatResponse = await ollama_client.chat(
            messages=messages,
            temperature=payload.temperature,
        )
        return {
            "success": True,
            "data": response.model_dump(),
            "error": None,
        }
    except OllamaConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except OllamaTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except OllamaError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc


@router.post("/generate-structured", response_model=dict[str, Any])
async def test_structured_generation(
    payload: TestStructuredRequest,
    ollama_client: OllamaClient = Depends(get_ollama_client),
) -> dict[str, Any]:
    """Generate and validate a structured DecisionInsightSchema response from Ollama."""
    messages = [
        ChatMessage(role=ChatRole.USER, content=payload.query),
    ]

    try:
        result = await ollama_client.generate_structured(
            messages=messages,
            response_schema=DecisionInsightSchema,
            system_instruction=payload.system_instruction or DECISION_ANALYST_SYSTEM_PROMPT,
            temperature=payload.temperature,
        )

        return {
            "success": result.success,
            "data": {
                "structured_output": result.data.model_dump() if result.data else None,
                "raw_content": result.raw_content,
                "eval_tokens": result.eval_tokens,
                "latency_ms": result.latency_ms,
                "attempts": result.attempts,
            },
            "error": result.error,
        }
    except OllamaConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except OllamaTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=str(exc),
        ) from exc
    except OllamaError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc

