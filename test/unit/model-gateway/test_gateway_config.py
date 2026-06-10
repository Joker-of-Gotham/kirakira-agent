import os

import pytest

from kirakira_model_gateway.config import GatewayConfig, _env_expand, _env_expand_str


def test_env_expand_str_basic():
    os.environ["KIRAKIRA_PY_TEST"] = "X"
    assert _env_expand_str("a${KIRAKIRA_PY_TEST}b") == "aXb"
    del os.environ["KIRAKIRA_PY_TEST"]


def test_env_expand_str_default():
    os.environ.pop("KIRAKIRA_PY_MISSING", None)
    assert _env_expand_str("${KIRAKIRA_PY_MISSING:-def}") == "def"


def test_env_expand_nested_dict():
    os.environ["KIRAKIRA_OUTER"] = "O"
    assert _env_expand({"k": "${KIRAKIRA_OUTER}"}) == {"k": "O"}
    del os.environ["KIRAKIRA_OUTER"]


def test_gateway_config_from_env_monkeypatch(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:9999/v1")
    monkeypatch.setenv("LLM_API_KEY", "k")
    monkeypatch.setenv("LLM_MODEL", "m")
    monkeypatch.setenv("LLM_MIRROR_BASE_URLS", "http://a/v1,http://b/v1")
    cfg = GatewayConfig.from_env()
    assert cfg.provider == "openai"
    assert cfg.base_url == "http://localhost:9999/v1"
    assert cfg.api_key == "k"
    assert cfg.model == "m"
    assert len(cfg.mirror_base_urls) == 2


def test_gateway_config_provider_defaults(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_BASE_URL", "")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_MODEL", "")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ARK_API_KEY", "")
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "deepseek-key")

    cfg = GatewayConfig.from_env()

    assert cfg.provider == "deepseek"
    assert cfg.base_url == "https://api.deepseek.com"
    assert cfg.api_key == "deepseek-key"
    assert cfg.model == "deepseek-v4-flash"


def test_gateway_config_auto_detects_single_provider_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_BASE_URL", "")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_MODEL", "")
    monkeypatch.setenv("LLM_PROVIDER", "auto")
    monkeypatch.setenv("DASHSCOPE_API_KEY", "dashscope-key")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("ARK_API_KEY", "")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "")

    cfg = GatewayConfig.from_env()

    assert cfg.provider == "aliyun-bailian"
    assert cfg.base_url == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert cfg.api_key == "dashscope-key"
    assert cfg.model == "qwen3.6-plus"


def test_all_base_urls_dedupes(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("LLM_BASE_URL", "http://same/v1")
    monkeypatch.setenv("LLM_MIRROR_BASE_URLS", "http://same/v1")
    cfg = GatewayConfig.from_env()
    urls = cfg.all_base_urls()
    assert urls == ["http://same/v1"]
