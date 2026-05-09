import pytest
from kirakira_model_gateway.providers import create_provider, ModelProvider
from kirakira_model_gateway.providers.openai_compat import OpenAIProvider
from kirakira_model_gateway.providers.ollama import OllamaProvider
from kirakira_model_gateway.providers.vllm import VllmProvider
from kirakira_model_gateway.providers.litellm_proxy import LitellmProxyProvider


def test_create_provider_openai():
    p = create_provider("openai", base_url="http://localhost/v1", api_key="k", model="m", timeout=10)
    assert isinstance(p, OpenAIProvider)


def test_create_provider_compatible():
    p = create_provider("compatible", base_url="http://localhost/v1", api_key="k", model="m", timeout=10)
    assert isinstance(p, OpenAIProvider)


@pytest.mark.parametrize("name", ["aliyun-bailian", "volcengine-ark", "bytedance", "deepseek"])
def test_create_provider_official_openai_compatible_aliases(name: str):
    p = create_provider(name, base_url="http://localhost/v1", api_key="k", model="m", timeout=10)
    assert isinstance(p, OpenAIProvider)


def test_create_provider_ollama():
    p = create_provider("ollama", base_url="http://localhost:11434", api_key="", model="llama3", timeout=10)
    assert isinstance(p, OllamaProvider)


def test_create_provider_vllm():
    p = create_provider("vllm", base_url="http://localhost:8000", api_key="EMPTY", model="m", timeout=10)
    assert isinstance(p, VllmProvider)


def test_create_provider_litellm():
    p = create_provider("litellm", base_url="http://localhost:4000", api_key="k", model="m", timeout=10)
    assert isinstance(p, LitellmProxyProvider)


def test_create_provider_unknown():
    with pytest.raises(ValueError, match="unknown provider"):
        create_provider("nonexistent", base_url="x", api_key="k", model="m", timeout=10)


def test_create_provider_aliases():
    from kirakira_model_gateway.providers.anthropic import AnthropicProvider
    from kirakira_model_gateway.providers.azure import AzureProvider

    p1 = create_provider("openai_compat", base_url="http://x/v1", api_key="k", model="m", timeout=10)
    assert isinstance(p1, OpenAIProvider)

    p2 = create_provider("claude", base_url="http://x", api_key="sk-ant-test", model="claude-3", timeout=10)
    assert isinstance(p2, AnthropicProvider)

    p3 = create_provider("azure_openai", base_url="https://myazure.openai.azure.com", api_key="key", model="dep", timeout=10)
    assert isinstance(p3, AzureProvider)
