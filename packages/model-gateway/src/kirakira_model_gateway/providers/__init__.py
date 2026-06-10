"""Provider factory — creates the right ModelProvider for a given provider name."""

from __future__ import annotations

from kirakira_model_gateway.providers.base import ModelProvider
from kirakira_model_gateway.providers.openai_compat import OpenAIProvider
from kirakira_model_gateway.providers.azure import AzureProvider
from kirakira_model_gateway.providers.anthropic import AnthropicProvider
from kirakira_model_gateway.providers.ollama import OllamaProvider
from kirakira_model_gateway.providers.vllm import VllmProvider
from kirakira_model_gateway.providers.litellm_proxy import LitellmProxyProvider
from kirakira_model_gateway.model_provider_catalog import load_model_provider_catalog


_LOCAL_PROVIDER_ALIASES: dict[str, type[ModelProvider]] = {
    "openai_compat": OpenAIProvider,
    "compatible": OpenAIProvider,
    "azure": AzureProvider,
    "azure_openai": AzureProvider,
    "azure-openai": AzureProvider,
    "anthropic": AnthropicProvider,
    "claude": AnthropicProvider,
    "ollama": OllamaProvider,
    "vllm": VllmProvider,
    "litellm": LitellmProxyProvider,
    "litellm_proxy": LitellmProxyProvider,
}


def _provider_aliases() -> dict[str, type[ModelProvider]]:
    aliases = dict(_LOCAL_PROVIDER_ALIASES)
    for alias in load_model_provider_catalog().openai_compatible_aliases():
        aliases.setdefault(alias, OpenAIProvider)
    return aliases


def create_provider(
    name: str,
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout: int,
    num_retries: int = 3,
    azure_api_version: str = "2024-02-15-preview",
    anthropic_base_url: str = "https://api.anthropic.com",
) -> ModelProvider:
    max_retries = max(0, min(int(num_retries), 10))
    key = name.strip().lower()

    cls = _provider_aliases().get(key)
    if cls is None:
        raise ValueError(f"unknown provider: {name!r}")

    if cls is AzureProvider:
        return AzureProvider(
            endpoint=base_url,
            api_key=api_key,
            api_version=azure_api_version,
            timeout=timeout,
            max_retries=max_retries,
        )

    if cls is AnthropicProvider:
        return AnthropicProvider(
            base_url=anthropic_base_url,
            api_key=api_key,
            timeout=timeout,
        )

    if cls is OllamaProvider:
        return OllamaProvider(
            base_url=base_url or "http://localhost:11434/v1",
            model=model,
            timeout=timeout,
        )

    if cls is VllmProvider:
        return VllmProvider(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout=timeout,
            max_retries=max_retries,
        )

    if cls is LitellmProxyProvider:
        return LitellmProxyProvider(
            base_url=base_url,
            api_key=api_key,
            model=model,
            timeout=timeout,
            max_retries=max_retries,
        )

    return OpenAIProvider(
        base_url=base_url,
        api_key=api_key,
        default_model=model,
        timeout=timeout,
        max_retries=max_retries,
    )


__all__ = [
    "ModelProvider",
    "OpenAIProvider",
    "AzureProvider",
    "AnthropicProvider",
    "OllamaProvider",
    "VllmProvider",
    "LitellmProxyProvider",
    "create_provider",
]
