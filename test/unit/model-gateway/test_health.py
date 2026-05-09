"""Health probe tests — unit tests for parsing/structure, local server integration tests."""

from __future__ import annotations

from kirakira_model_gateway.health import check_health, _sample_model_ids
from kirakira_model_gateway.types import HealthStatus


def test_sample_model_ids_with_data():
    payload = {"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}]}
    result = _sample_model_ids(payload)
    assert result == ["gpt-4o", "gpt-4o-mini"]


def test_sample_model_ids_empty():
    assert _sample_model_ids({}) == []
    assert _sample_model_ids({"data": []}) == []
    assert _sample_model_ids(None) == []


def test_sample_model_ids_limit():
    payload = {"data": [{"id": f"m-{i}"} for i in range(20)]}
    result = _sample_model_ids(payload, limit=3)
    assert len(result) == 3
    assert result == ["m-0", "m-1", "m-2"]


def test_health_status_structure():
    status = HealthStatus(
        ok=True, latency_ms=42.5, chat_ok=True, models_ok=True,
        chat_latency_ms=20.0, models_latency_ms=22.5,
        error=None, active_base_url="http://localhost:8000/v1",
        models_sample=["gpt-4o"],
    )
    assert status.ok is True
    assert status.latency_ms == 42.5
    assert status.models_sample == ["gpt-4o"]
    assert status.error is None


def test_check_health_unreachable():
    """Health check against an unreachable host returns ok=False with error details."""
    st = check_health(
        "http://127.0.0.1:1",
        api_key="test",
        model="test-model",
        timeout=2,
    )
    assert isinstance(st, HealthStatus)
    assert st.ok is False
    assert st.error is not None
    assert st.latency_ms >= 0.0


def test_check_health_local_server(openai_compat_server: str):
    """Full health check against a real local OpenAI-compatible HTTP server."""
    st = check_health(
        openai_compat_server,
        api_key="test-key",
        model="test-model",
        timeout=10,
    )
    assert isinstance(st, HealthStatus)
    assert isinstance(st.ok, bool)
    assert st.latency_ms >= 0.0
    assert st.models_ok is True, f"models check failed: {st.error}"
    assert len(st.models_sample) >= 1
    assert st.chat_ok is True, f"chat check failed: {st.error}"
    assert st.ok is True, f"health check failed: {st.error}"
