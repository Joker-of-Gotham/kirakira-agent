"""Model capability registry — tracks what each model/provider supports.

Capability-aware routing prevents sending tool-call requests to models
that don't support function calling, or vision prompts to text-only models.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class ModelCapability:
    supports_function_calling: bool = False
    supports_structured_output: bool = False
    supports_vision: bool = False
    supports_batch: bool = False
    supports_streaming: bool = True
    supports_mcp_tools: bool = False
    supports_reasoning: bool = False
    supports_memory: bool = False
    supports_tool_search: bool = False
    supports_long_context: bool = False
    max_context_tokens: int = 8192
    max_output_tokens: int = 4096
    price_class: str = "medium"
    latency_class: str = "medium"
    data_residency: str = "us"
    requires_approval: bool = False


_BUILTIN_CAPABILITIES: dict[str, ModelCapability] = {
    # OpenAI
    "gpt-4o": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=True,
        supports_vision=True,
        supports_mcp_tools=True,
        supports_tool_search=True,
        supports_long_context=True,
        max_context_tokens=128_000,
        max_output_tokens=16_384,
        price_class="medium",
        latency_class="fast",
    ),
    "gpt-4o-mini": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=True,
        supports_vision=True,
        supports_mcp_tools=True,
        supports_tool_search=True,
        supports_long_context=True,
        max_context_tokens=128_000,
        max_output_tokens=16_384,
        price_class="low",
        latency_class="fast",
    ),
    "gpt-4.1": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=True,
        supports_vision=True,
        supports_mcp_tools=True,
        supports_tool_search=True,
        supports_long_context=True,
        max_context_tokens=1_047_576,
        max_output_tokens=32_768,
        price_class="medium",
        latency_class="fast",
    ),
    "o3": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=True,
        supports_vision=True,
        supports_mcp_tools=True,
        supports_reasoning=True,
        supports_tool_search=True,
        supports_long_context=True,
        max_context_tokens=200_000,
        max_output_tokens=100_000,
        price_class="premium",
        latency_class="slow",
    ),

    # Anthropic
    "claude-sonnet-4-20250514": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=True,
        supports_vision=True,
        supports_mcp_tools=True,
        supports_reasoning=True,
        supports_tool_search=True,
        supports_long_context=True,
        supports_memory=True,
        max_context_tokens=200_000,
        max_output_tokens=16_384,
        price_class="medium",
        latency_class="fast",
    ),
    "claude-opus-4-20250514": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=True,
        supports_vision=True,
        supports_mcp_tools=True,
        supports_reasoning=True,
        supports_tool_search=True,
        supports_long_context=True,
        supports_memory=True,
        max_context_tokens=200_000,
        max_output_tokens=32_000,
        price_class="premium",
        latency_class="slow",
        requires_approval=True,
    ),

    # Qwen (local)
    "Qwen/Qwen3-32B": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=False,
        supports_vision=False,
        supports_long_context=True,
        max_context_tokens=131_072,
        max_output_tokens=8_192,
        price_class="low",
        latency_class="medium",
        data_residency="local",
    ),
    "Qwen/Qwen3.5-35B-A3B": ModelCapability(
        supports_function_calling=True,
        supports_structured_output=False,
        supports_vision=False,
        supports_long_context=True,
        max_context_tokens=131_072,
        max_output_tokens=8_192,
        price_class="low",
        latency_class="medium",
        data_residency="local",
    ),
}


@dataclass
class ModelCapabilityRegistry:
    _entries: dict[str, ModelCapability] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._entries.update(_BUILTIN_CAPABILITIES)

    def register(self, model_id: str, capability: ModelCapability) -> None:
        self._entries[model_id] = capability

    def get(self, model_id: str) -> Optional[ModelCapability]:
        if model_id in self._entries:
            return self._entries[model_id]
        lower = model_id.lower()
        for key, cap in self._entries.items():
            if key.lower() == lower:
                return cap
        best_cap: Optional[ModelCapability] = None
        best_len = 0
        for key, cap in self._entries.items():
            kl = key.lower()
            if lower.startswith(kl) and len(kl) > best_len:
                best_cap = cap
                best_len = len(kl)
        return best_cap

    def list_models(self) -> list[str]:
        return sorted(self._entries.keys())

    def supports_feature(self, model_id: str, feature: str) -> bool:
        cap = self.get(model_id)
        if cap is None:
            return False
        return bool(getattr(cap, feature, False))

    def to_dict(self) -> dict[str, dict]:
        from dataclasses import asdict
        return {k: asdict(v) for k, v in self._entries.items()}
