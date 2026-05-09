"""Core data types for the Kirakira model gateway."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, Field


class MirrorConfig(BaseModel):
    """Mirror endpoint rotation configuration (Pydantic model for .model_copy support)."""

    base_urls: list[str] = Field(default_factory=list)
    switch_on_error_count: int = Field(default=12, ge=1, le=200)
    switch_cooldown_sec: float = Field(default=60.0, ge=0.0, le=3600.0)
    active_idx: int = Field(default=0, ge=0)

    def normalized_urls(self) -> list[str]:
        """Return deduped, non-empty base URLs with trailing slashes stripped."""
        seen: set[str] = set()
        out: list[str] = []
        for u in self.base_urls:
            norm = str(u).strip().rstrip("/")
            if norm and norm not in seen:
                seen.add(norm)
                out.append(norm)
        return out


@dataclass(frozen=True)
class ModelInfo:
    """Metadata for a model accessible through the gateway."""

    id: str
    provider: str
    owned_by: str = ""
    context_window: Optional[int] = None
    supports_streaming: bool = True
    supports_structured_output: bool = False


@dataclass
class CompletionRequest:
    """Incoming JSON-RPC completion request."""

    prompt: str
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    max_tokens: int = 4096
    stream: bool = False
    stop: Optional[list[str]] = None
    response_format: Optional[dict[str, Any]] = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class CompletionResult:
    """Result from a completion request."""

    text: Optional[str] = None
    model: str = ""
    raw_error: Optional[str] = None
    usage: Optional[dict[str, int]] = None
    finish_reason: Optional[str] = None
    latency_ms: Optional[float] = None
    provider: Optional[str] = None


@dataclass
class HealthStatus:
    """Result of a gateway health check."""

    ok: bool
    latency_ms: float
    chat_ok: bool = False
    models_ok: bool = False
    chat_latency_ms: Optional[float] = None
    models_latency_ms: Optional[float] = None
    error: Optional[str] = None
    active_base_url: Optional[str] = None
    models_sample: list[str] = field(default_factory=list)
