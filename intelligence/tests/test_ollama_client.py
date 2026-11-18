from __future__ import annotations

import asyncio
import json
from typing import Any
import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

from cortex_intelligence.api.main import create_app
from cortex_intelligence.config import Settings, get_settings
from cortex_intelligence.llm import (
    ChatMessage,
    ChatRole,
    DecisionInsightSchema,
    OllamaClient,
    OllamaConnectionError,
    OllamaConnectivityStatus,
    OllamaResponseError,
    OllamaTimeoutError,
    clean_json_text,
)


class SampleMetricSchema(BaseModel):
    metric_name: str
    target_value: float = Field(ge=0.0)
    status: str = Field(pattern="^(ON_TRACK|AT_RISK|CRITICAL)$")


@pytest.mark.anyio
async def test_ollama_live_connectivity():
    """Verify that the local Ollama daemon is active and cortex-qwen is available."""
    settings = get_settings()
    async with OllamaClient(settings) as client:
        status_info: OllamaConnectivityStatus = await client.check_connectivity()
        assert status_info.connected is True
        assert status_info.model_available is True
        assert status_info.target_model in ("cortex-qwen:latest", "cortex-qwen")
        assert status_info.context_limit == 4096
        assert status_info.latency_ms is not None
        assert status_info.latency_ms > 0
        assert status_info.error is None
        assert len(status_info.available_models) > 0


@pytest.mark.anyio
async def test_ollama_live_structured_generation():
    """Verify that cortex-qwen generates valid JSON strictly parsed into a Pydantic schema."""
    settings = get_settings()
    async with OllamaClient(settings) as client:
        messages = [
            ChatMessage(
                role=ChatRole.USER,
                content=(
                    "Evaluate whether to approve an emergency expedited logistics shipment for "
                    "flagship vendor SYN-SUP-001 experiencing a 14-day delay on purchase order SYN-PO-0004. "
                    "Respond with your structured decision summary, recommendation, confidence, key factors, and risk assessment."
                ),
            )
        ]
        result = await client.generate_structured(
            messages=messages,
            response_schema=DecisionInsightSchema,
            temperature=0.2,
        )

        assert result.success is True
        assert result.data is not None
        assert isinstance(result.data, DecisionInsightSchema)
        assert result.data.recommendation in ("Approve", "Reject", "Conditionally Approve", "Escalate")
        assert 0.0 <= result.data.confidence <= 1.0
        assert len(result.data.key_factors) >= 1
        assert len(result.data.decision_summary) > 10
        assert result.eval_tokens is not None and result.eval_tokens > 0
        assert result.latency_ms is not None and result.latency_ms > 0


def test_clean_json_text_helper():
    """Verify clean_json_text handles raw, markdown-fenced, and noisy strings."""
    # 1. Pure JSON
    assert clean_json_text('{"status": "ok"}') == '{"status": "ok"}'

    # 2. Markdown fenced with json
    fenced = '```json\n{"status": "ok", "count": 42}\n```'
    assert clean_json_text(fenced) == '{"status": "ok", "count": 42}'

    # 3. Markdown fenced without json tag
    fenced_raw = '```\n{"status": "ok"}\n```'
    assert clean_json_text(fenced_raw) == '{"status": "ok"}'

    # 4. Leading and trailing commentary
    commentary = 'Here is the requested output:\n{"decision": "approve"}\nHope this helps!'
    assert clean_json_text(commentary) == '{"decision": "approve"}'


@pytest.mark.anyio
async def test_concurrency_serialization_lock():
    """Verify that multiple concurrent calls acquire the GPU lock sequentially rather than in parallel."""
    settings = get_settings()
    async with OllamaClient(settings) as client:
        active_inferences = 0
        max_concurrent_seen = 0

        original_post = client._client.post

        async def mocked_post(url: str, **kwargs: Any) -> httpx.Response:
            nonlocal active_inferences, max_concurrent_seen
            active_inferences += 1
            max_concurrent_seen = max(max_concurrent_seen, active_inferences)
            await asyncio.sleep(0.05)  # Simulate GPU execution time
            active_inferences -= 1
            return httpx.Response(
                200,
                json={
                    "model": "cortex-qwen",
                    "message": {"role": "assistant", "content": '{"metric_name": "COGS", "target_value": 85.5, "status": "ON_TRACK"}'},
                    "done": True,
                    "eval_count": 15,
                },
                request=httpx.Request("POST", url),
            )

        client._client.post = mocked_post  # type: ignore[method-assign]

        tasks = [
            client.generate_structured(
                messages=[ChatMessage(role=ChatRole.USER, content=f"Task {i}")],
                response_schema=SampleMetricSchema,
            )
            for i in range(4)
        ]

        results = await asyncio.gather(*tasks)
        assert len(results) == 4
        assert all(r.success is True for r in results)
        assert max_concurrent_seen == 1, "Concurrency lock failed! Requests ran in parallel."


@pytest.mark.anyio
async def test_schema_validation_retry_and_failure():
    """Verify self-correction retry when model produces invalid schema output."""
    settings = get_settings()
    async with OllamaClient(settings) as client:
        calls = 0

        async def mocked_flaky_post(url: str, **kwargs: Any) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                # First attempt: invalid status string (fails regex constraint)
                content = '{"metric_name": "Revenue", "target_value": 100.0, "status": "UNKNOWN_VALUE"}'
            else:
                # Second attempt: valid status string
                content = '{"metric_name": "Revenue", "target_value": 100.0, "status": "ON_TRACK"}'

            return httpx.Response(
                200,
                json={
                    "model": "cortex-qwen",
                    "message": {"role": "assistant", "content": content},
                    "done": True,
                    "eval_count": 20,
                },
                request=httpx.Request("POST", url),
            )

        client._client.post = mocked_flaky_post  # type: ignore[method-assign]

        res = await client.generate_structured(
            messages=[ChatMessage(role=ChatRole.USER, content="Query")],
            response_schema=SampleMetricSchema,
            max_retries=1,
        )

        assert res.success is True
        assert res.attempts == 2
        assert res.data is not None
        assert res.data.status == "ON_TRACK"


@pytest.mark.anyio
async def test_timeout_and_connection_error_handling():
    """Verify timeout and connection refusal error mapping."""
    settings = get_settings()

    # 1. Timeout mapping
    async with OllamaClient(settings) as client:
        async def mocked_timeout(url: str, **kwargs: Any) -> httpx.Response:
            raise httpx.ReadTimeout("Read timed out")

        client._client.post = mocked_timeout  # type: ignore[method-assign]
        with pytest.raises(OllamaTimeoutError):
            await client.chat([ChatMessage(role=ChatRole.USER, content="Ping")])

    # 2. Connection refused mapping on unreachable port
    bad_settings = Settings(
        OLLAMA_BASE_URL="http://127.0.0.1:59999",
        OLLAMA_TIMEOUT_SECONDS=1.0,
    )
    async with OllamaClient(bad_settings) as dead_client:
        status_info = await dead_client.check_connectivity()
        assert status_info.connected is False
        assert "Connection refused" in (status_info.error or "")

        with pytest.raises(OllamaConnectionError):
            await dead_client.chat([ChatMessage(role=ChatRole.USER, content="Ping")])


def test_fastapi_llm_routes():
    """Verify FastAPI /api/v1/llm endpoints with authentication."""
    settings = get_settings()
    app = create_app(settings_override=settings)
    api_key = settings.intelligence_api_key

    with TestClient(app) as test_client:
        # 1. Unauthorized without key
        res_unauth = test_client.get("/api/v1/llm/connectivity")
        assert res_unauth.status_code == 401

        # 2. Authorized connectivity check
        headers = {"X-Cortex-Service-Key": api_key}
        res_conn = test_client.get("/api/v1/llm/connectivity", headers=headers)
        assert res_conn.status_code == 200
        data = res_conn.json()
        assert data["success"] is True
        assert data["data"]["connected"] is True
        assert data["data"]["model_available"] is True

        # 3. Test chat endpoint
        res_chat = test_client.post(
            "/api/v1/llm/chat",
            headers=headers,
            json={"prompt": "Respond with the single word: OK", "temperature": 0.1},
        )
        assert res_chat.status_code == 200
        chat_data = res_chat.json()
        assert chat_data["success"] is True
        assert "OK" in chat_data["data"]["message"]["content"].upper()

        # 4. Test structured generation endpoint
        res_struct = test_client.post(
            "/api/v1/llm/generate-structured",
            headers=headers,
            json={"query": "Evaluate supply delay risk for supplier SYN-SUP-001"},
        )
        assert res_struct.status_code == 200
        struct_data = res_struct.json()
        assert struct_data["success"] is True
        assert struct_data["data"]["structured_output"] is not None
        assert struct_data["data"]["structured_output"]["confidence"] is not None

