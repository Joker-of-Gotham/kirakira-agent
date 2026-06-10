"""Model capability registry — tracks what each model/provider supports.

Capability-aware routing prevents sending tool-call requests to models
that don't support function calling, or vision prompts to text-only models.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from kirakira_model_gateway.model_metadata_catalog import load_model_metadata_catalog

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


def _builtin_capabilities() -> dict[str, ModelCapability]:
    entries: dict[str, ModelCapability] = {}
    for model in load_model_metadata_catalog().models:
        cap = model.capabilities
        classes = model.classes
        capability = ModelCapability(
            supports_function_calling=cap.function_calling,
            supports_structured_output=cap.structured_output,
            supports_vision=cap.vision,
            supports_batch=cap.batch,
            supports_streaming=cap.streaming,
            supports_mcp_tools=cap.mcp_tools,
            supports_reasoning=cap.reasoning,
            supports_memory=cap.memory,
            supports_tool_search=cap.tool_search,
            supports_long_context=cap.long_context,
            max_context_tokens=model.context_window,
            max_output_tokens=model.max_output_tokens,
            price_class=classes.price,
            latency_class=classes.latency,
            data_residency=classes.data_residency,
            requires_approval=cap.requires_approval,
        )
        entries[model.id] = capability
        for alias in model.aliases:
            entries[alias] = capability
    return entries


@dataclass
class ModelCapabilityRegistry:
    _entries: dict[str, ModelCapability] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self._entries.update(_builtin_capabilities())

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
