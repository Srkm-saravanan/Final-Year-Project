from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Type, TypeVar
import httpx
from pydantic import BaseModel, ValidationError

from cortex_intelligence.config import Settings, get_settings
from cortex_intelligence.llm.exceptions import (
    OllamaConnectionError,
    OllamaResponseError,
    OllamaTimeoutError,
    OllamaValidationError,
)
from cortex_intelligence.llm.models import (
    ChatMessage,
    ChatRole,
    OllamaChatPayload,
    OllamaChatRequest,
    OllamaChatResponse,
    OllamaConnectivityStatus,
    OllamaModelOptions,
    StructuredGenerationResult,
)
from cortex_intelligence.llm.prompts import (
    DECISION_ANALYST_SYSTEM_PROMPT,
    build_system_prompt_with_json_schema,
    clean_json_text,
)

logger = logging.getLogger("cortex_intelligence.llm.client")
T = TypeVar("T", bound=BaseModel)


class OllamaClient:
    """Production-grade asynchronous client for local Ollama LLM inference.
    
    Adheres strictly to the CORTEX Phase 1 specifications:
    - Dedicated connection pooling via httpx.AsyncClient.
    - Context limit pinned to 4096 tokens (options.num_ctx = 4096).
    - Concurrency serialization lock protecting RTX 2050 (4GB VRAM) from OOM thrashing.
    - Zero-prose structured JSON enforcement with Pydantic validation and self-correction retry.
    """

    def __init__(
        self,
        settings: Settings | None = None,
        base_url: str | None = None,
        model: str | None = None,
        context_size: int | None = None,
        temperature: float | None = None,
        timeout_seconds: float | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        cfg = settings or get_settings()
        self.base_url = (base_url or cfg.ollama_base_url).rstrip("/")
        self.model = model or cfg.ollama_model
        self.context_size = context_size or cfg.ollama_context_size
        self.temperature = temperature if temperature is not None else cfg.ollama_temperature
        self.timeout_seconds = timeout_seconds or cfg.ollama_timeout_seconds

        self._external_client = http_client is not None
        self._client = http_client or httpx.AsyncClient(
            base_url=self.base_url,
            timeout=httpx.Timeout(self.timeout_seconds, connect=5.0),
            limits=httpx.Limits(max_keepalive_connections=5, max_connections=10),
        )
        # Strict global lock: only one model inference runs on the GPU at a time
        self._inference_lock = asyncio.Lock()

    async def __aenter__(self) -> "OllamaClient":
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Release underlying HTTP resources."""
        if not self._external_client and not self._client.is_closed:
            await self._client.aclose()

    async def check_connectivity(self) -> OllamaConnectivityStatus:
        """Verify that the Ollama daemon is active and the target model is available."""
        start_time = time.perf_counter()
        url = "/api/tags"
        try:
            response = await self._client.get(url)
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            if response.status_code != 200:
                return OllamaConnectivityStatus(
                    connected=False,
                    base_url=self.base_url,
                    target_model=self.model,
                    model_available=False,
                    available_models=[],
                    latency_ms=elapsed_ms,
                    context_limit=self.context_size,
                    error=f"Ollama returned HTTP {response.status_code}: {response.text[:200]}",
                )

            data = response.json()
            models_list = [
                m.get("name") or m.get("model")
                for m in data.get("models", [])
                if m.get("name") or m.get("model")
            ]

            target_base = self.model.split(":")[0]
            model_available = any(
                m == self.model
                or m.startswith(f"{self.model}:")
                or m.split(":")[0] == target_base
                for m in models_list
            )

            return OllamaConnectivityStatus(
                connected=True,
                base_url=self.base_url,
                target_model=self.model,
                model_available=model_available,
                available_models=models_list,
                latency_ms=elapsed_ms,
                context_limit=self.context_size,
                error=None if model_available else f"Model '{self.model}' not found in local Ollama repository.",
            )
        except httpx.ConnectError as exc:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning("Ollama connection failed on %s: %s", self.base_url, exc)
            return OllamaConnectivityStatus(
                connected=False,
                base_url=self.base_url,
                target_model=self.model,
                model_available=False,
                available_models=[],
                latency_ms=elapsed_ms,
                context_limit=self.context_size,
                error=f"Connection refused at {self.base_url}. Verify 'ollama serve' is active.",
            )
        except httpx.TimeoutException as exc:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.warning("Ollama connectivity check timed out: %s", exc)
            return OllamaConnectivityStatus(
                connected=False,
                base_url=self.base_url,
                target_model=self.model,
                model_available=False,
                available_models=[],
                latency_ms=elapsed_ms,
                context_limit=self.context_size,
                error=f"Request to {self.base_url}/api/tags timed out after {self.timeout_seconds}s.",
            )
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error("Unexpected error checking Ollama connectivity: %s", exc)
            return OllamaConnectivityStatus(
                connected=False,
                base_url=self.base_url,
                target_model=self.model,
                model_available=False,
                available_models=[],
                latency_ms=elapsed_ms,
                context_limit=self.context_size,
                error=f"Unexpected error: {str(exc)}",
            )

    async def chat(
        self,
        messages: list[ChatMessage],
        model: str | None = None,
        format_json: bool = False,
        temperature: float | None = None,
        num_ctx: int | None = None,
    ) -> OllamaChatResponse:
        """Send a turn-based chat request to Ollama /api/chat serialized through the GPU lock."""
        target_model = model or self.model
        ctx_limit = num_ctx or self.context_size
        temp = temperature if temperature is not None else self.temperature

        payload = OllamaChatRequest(
            model=target_model,
            messages=messages,
            format="json" if format_json else None,
            stream=False,
            options=OllamaModelOptions(
                num_ctx=ctx_limit,
                temperature=temp,
            ),
        )

        # Enforce serial execution on the GPU to protect 4GB VRAM
        async with self._inference_lock:
            start_time = time.perf_counter()
            try:
                response = await self._client.post(
                    "/api/chat",
                    json=payload.model_dump(exclude_none=True),
                )
            except httpx.ConnectError as exc:
                logger.error("Ollama connection failed on POST /api/chat: %s", exc)
                raise OllamaConnectionError(
                    f"Failed to connect to Ollama at {self.base_url}. Ensure Ollama is running."
                ) from exc
            except httpx.TimeoutException as exc:
                logger.error("Ollama chat request timed out after %ss: %s", self.timeout_seconds, exc)
                raise OllamaTimeoutError(
                    f"Ollama chat request timed out after {self.timeout_seconds}s."
                ) from exc

            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

            if response.status_code != 200:
                err_text = response.text[:300]
                logger.error("Ollama chat HTTP error %s: %s", response.status_code, err_text)
                raise OllamaResponseError(
                    f"Ollama chat API returned status {response.status_code}: {err_text}",
                    status_code=response.status_code,
                )

            try:
                res_data = response.json()
                parsed = OllamaChatResponse.model_validate(res_data)
                logger.info(
                    "Ollama chat complete [model=%s, tokens=%s, latency=%sms]",
                    target_model,
                    parsed.eval_count,
                    duration_ms,
                )
                return parsed
            except Exception as exc:
                logger.error("Failed to parse Ollama response JSON: %s", exc)
                raise OllamaResponseError(f"Malformed response from Ollama: {response.text[:200]}") from exc

    async def generate_structured(
        self,
        messages: list[ChatMessage],
        response_schema: Type[T],
        model: str | None = None,
        system_instruction: str | None = None,
        max_retries: int = 1,
        temperature: float | None = None,
    ) -> StructuredGenerationResult[T]:
        """Generate structured data strictly validated against a Pydantic schema with auto-retry."""
        start_time = time.perf_counter()
        active_messages = list(messages)

        # Ensure system prompt incorporates the target JSON schema
        base_instruction = system_instruction or DECISION_ANALYST_SYSTEM_PROMPT
        schema_prompt = build_system_prompt_with_json_schema(base_instruction, response_schema)
        # Prepend or replace system message
        if active_messages and active_messages[0].role == ChatRole.SYSTEM:
            active_messages[0] = ChatMessage(role=ChatRole.SYSTEM, content=schema_prompt)
        else:
            active_messages.insert(0, ChatMessage(role=ChatRole.SYSTEM, content=schema_prompt))

        last_raw_content = ""
        last_error = ""

        for attempt in range(1, max_retries + 2):
            try:
                chat_res = await self.chat(
                    messages=active_messages,
                    model=model,
                    format_json=True,
                    temperature=temperature,
                )
                raw_text = chat_res.message.content
                last_raw_content = raw_text
                cleaned = clean_json_text(raw_text)

                # Validate against target Pydantic schema
                validated_data = response_schema.model_validate_json(cleaned)
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

                return StructuredGenerationResult[T](
                    success=True,
                    data=validated_data,
                    raw_content=raw_text,
                    error=None,
                    eval_tokens=chat_res.eval_count,
                    latency_ms=elapsed_ms,
                    attempts=attempt,
                )
            except (ValidationError, json.JSONDecodeError) as exc:
                last_error = f"{type(exc).__name__}: {str(exc)}"
                logger.warning(
                    "Schema validation failed on attempt %s/%s: %s",
                    attempt,
                    max_retries + 1,
                    last_error,
                )
                if attempt <= max_retries:
                    # Append error feedback turn and retry
                    active_messages.append(ChatMessage(role=ChatRole.ASSISTANT, content=last_raw_content))
                    active_messages.append(
                        ChatMessage(
                            role=ChatRole.USER,
                            content=(
                                f"Your previous output failed JSON validation: {last_error}.\n"
                                "Please correct the output and respond strictly with the valid JSON object."
                            ),
                        )
                    )
            except OllamaError as exc:
                elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
                return StructuredGenerationResult[T](
                    success=False,
                    data=None,
                    raw_content="",
                    error=str(exc),
                    latency_ms=elapsed_ms,
                    attempts=attempt,
                )

        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
        return StructuredGenerationResult[T](
            success=False,
            data=None,
            raw_content=last_raw_content,
            error=f"Output failed schema validation after {max_retries + 1} attempts. Last error: {last_error}",
            latency_ms=elapsed_ms,
            attempts=max_retries + 1,
        )
