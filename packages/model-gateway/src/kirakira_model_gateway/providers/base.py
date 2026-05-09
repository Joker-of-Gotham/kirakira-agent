"""Abstract base for all LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator, Optional


class ModelProvider(ABC):
    """Unified interface for LLM chat completions."""

    @abstractmethod
    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        """Synchronous chat completion. Returns raw response dict."""
        ...

    @abstractmethod
    def list_models(self) -> list[dict[str, Any]]:
        """List available models."""
        ...

    def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> Any:
        """Streaming completion (optional). Falls back to non-streaming."""
        return self.complete(
            messages, model=model, temperature=temperature, max_tokens=max_tokens
        )
