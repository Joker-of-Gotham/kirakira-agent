"""OpenAI-compatible client tests — unit tests for request building, local server integration tests."""

from __future__ import annotations

from kirakira_model_gateway.client import (
    OpenAICompatClient,
    build_openai_compatible_url,
    extract_json,
    _build_messages,
)


def test_build_messages_user_only():
    msgs = _build_messages("Hello", system_prompt=None)
    assert len(msgs) == 1
    assert msgs[0] == {"role": "user", "content": "Hello"}


def test_build_messages_with_system():
    msgs = _build_messages("Hi", system_prompt="Be helpful")
    assert len(msgs) == 2
    assert msgs[0] == {"role": "system", "content": "Be helpful"}
    assert msgs[1] == {"role": "user", "content": "Hi"}


def test_extract_json_plain():
    assert extract_json('{"a": 1}') == {"a": 1}


def test_extract_json_fenced():
    text = "Here is the result:\n```json\n{\"x\": 42}\n```\nDone."
    assert extract_json(text) == {"x": 42}


def test_extract_json_array():
    assert extract_json("[1, 2, 3]") == [1, 2, 3]


def test_extract_json_invalid():
    assert extract_json("not json at all") is None


def test_client_no_base_url():
    client = OpenAICompatClient("", api_key="k", model="m")
    assert client.complete("hello") is None
    assert client.list_models() is None


def test_build_openai_compatible_url_provider_defaults():
    assert (
        build_openai_compatible_url("https://api.openai.com", "/models")
        == "https://api.openai.com/v1/models"
    )
    assert (
        build_openai_compatible_url("https://dashscope.aliyuncs.com", "/chat/completions")
        == "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    )
    assert (
        build_openai_compatible_url("https://ark.cn-beijing.volces.com", "/models")
        == "https://ark.cn-beijing.volces.com/api/v3/models"
    )
    assert (
        build_openai_compatible_url("https://api.deepseek.com", "/models")
        == "https://api.deepseek.com/models"
    )


def test_build_openai_compatible_url_preserves_versioned_base():
    assert (
        build_openai_compatible_url(
            "https://ark.cn-beijing.volces.com/api/v3",
            "/chat/completions",
        )
        == "https://ark.cn-beijing.volces.com/api/v3/chat/completions"
    )
    assert (
        build_openai_compatible_url(
            "http://127.0.0.1:8000/v1",
            "/chat/completions",
        )
        == "http://127.0.0.1:8000/v1/chat/completions"
    )


def test_client_unreachable():
    client = OpenAICompatClient(
        "http://127.0.0.1:1/v1",
        api_key="test",
        model="test",
        timeout=2,
        max_retries=0,
    )
    result = client.list_models()
    assert result is None


def test_client_list_models_local_server(openai_compat_server: str):
    """Exercise list_models against a real local OpenAI-compatible HTTP server."""
    client = OpenAICompatClient(
        openai_compat_server,
        api_key="test-key",
        model="test-model",
        timeout=10,
        max_retries=0,
    )
    models = client.list_models()
    assert models is not None, "list_models() returned None from local server"
    assert isinstance(models, list)
    assert len(models) >= 1
    model_ids = [m["id"] for m in models]
    assert "test-model" in model_ids
