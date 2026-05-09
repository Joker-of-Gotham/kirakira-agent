"""Backward-compatible provider module — delegates to providers/ package."""

from kirakira_model_gateway.providers import (
    ModelProvider,
    OpenAIProvider,
    AzureProvider,
    AnthropicProvider,
    OllamaProvider,
    VllmProvider,
    LitellmProxyProvider,
    create_provider,
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
