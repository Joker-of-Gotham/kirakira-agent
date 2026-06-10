import json
from pathlib import Path

import pytest

from kirakira_model_gateway.client import build_openai_compatible_url
from kirakira_model_gateway.config import GatewayConfig
from kirakira_model_gateway.model_provider_catalog import (
    CATALOG_ENV,
    build_openai_compatible_url as catalog_url,
    load_model_provider_catalog,
    resolve_model_provider_catalog_path,
)
from kirakira_model_gateway.providers import create_provider
from kirakira_model_gateway.providers.openai_compat import OpenAIProvider


def test_python_catalog_loads_core_provider_catalog():
    path = resolve_model_provider_catalog_path()
    assert path.as_posix().endswith("packages/core/src/model-providers.catalog.json")

    raw = json.loads(path.read_text(encoding="utf-8"))
    catalog = load_model_provider_catalog()

    assert [provider.id for provider in catalog.providers] == [
        provider["id"] for provider in raw["providers"]
    ]
    assert catalog.normalize_provider_id("dashscope") == "aliyun-bailian"
    assert catalog.get_provider("deepseek").default_model == "deepseek-v4-flash"
    assert "volcengine-ark" in catalog.openai_compatible_aliases()


def test_gateway_config_reads_provider_defaults_from_catalog(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    catalog_path = tmp_path / "model-providers.catalog.json"
    catalog_path.write_text(
        json.dumps(
            {
                "providers": [
                    {
                        "id": "test-provider",
                        "label": "Test Provider",
                        "keyEnv": "TEST_PROVIDER_API_KEY",
                        "baseUrl": "https://models.example.test/custom/v9",
                        "modelsEndpoint": "/models",
                        "defaultModel": "test-default-model",
                        "fallbackModels": ["test-default-model"],
                    }
                ],
                "aliases": {
                    "auto": "auto",
                    "test-alias": "test-provider",
                },
            },
        ),
        encoding="utf-8",
    )
    monkeypatch.setenv(CATALOG_ENV, str(catalog_path))
    monkeypatch.setenv("LLM_PROVIDER", "test-alias")
    monkeypatch.setenv("TEST_PROVIDER_API_KEY", "test-key")
    monkeypatch.setenv("LLM_API_KEY", "")
    monkeypatch.setenv("LLM_BASE_URL", "")
    monkeypatch.setenv("LLM_MODEL", "")

    cfg = GatewayConfig.from_env()

    assert cfg.provider == "test-provider"
    assert cfg.base_url == "https://models.example.test/custom/v9"
    assert cfg.api_key == "test-key"
    assert cfg.model == "test-default-model"
    assert (
        catalog_url("https://models.example.test", "/models")
        == "https://models.example.test/custom/v9/models"
    )


def test_client_url_builder_uses_catalog_host_rules():
    assert build_openai_compatible_url("https://api.openai.com", "/models") == (
        "https://api.openai.com/v1/models"
    )
    assert build_openai_compatible_url("https://dashscope.aliyuncs.com", "/models") == (
        "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
    )
    assert build_openai_compatible_url("https://ark.cn-beijing.volces.com", "/models") == (
        "https://ark.cn-beijing.volces.com/api/v3/models"
    )
    assert build_openai_compatible_url("https://api.deepseek.com", "/models") == (
        "https://api.deepseek.com/models"
    )


def test_provider_factory_uses_catalog_aliases():
    provider = create_provider(
        "deepseek-official",
        base_url="https://api.deepseek.com",
        api_key="test",
        model="deepseek-chat",
        timeout=10,
    )
    assert isinstance(provider, OpenAIProvider)
