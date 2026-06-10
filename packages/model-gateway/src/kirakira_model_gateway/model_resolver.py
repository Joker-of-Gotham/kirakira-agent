"""Model name resolution — aliases, fuzzy matching, provider prefix stripping.

Fixes the V3 model name identification issues:
- Strips LiteLLM-style provider prefixes (openai/, anthropic/, etc.)
- Resolves short aliases to canonical versioned model IDs
- Detects config drift by comparing configured name against /v1/models
"""

from __future__ import annotations

import re
from typing import Optional

from kirakira_model_gateway.model_provider_catalog import load_model_provider_catalog

_LOCAL_PROVIDER_PREFIXES = (
    "openai/",
    "anthropic/",
    "azure/",
    "ollama/",
    "vllm/",
    "litellm/",
    "local/",
    "groq/",
    "together/",
)


def _provider_prefixes() -> tuple[str, ...]:
    catalog = load_model_provider_catalog()
    catalog_prefixes = tuple(f"{alias}/" for alias in catalog.openai_compatible_aliases())
    return (*_LOCAL_PROVIDER_PREFIXES, *catalog_prefixes)

_ALIASES: dict[str, str] = {
    "gpt-4o": "gpt-4o-2024-11-20",
    "gpt-4o-mini": "gpt-4o-mini-2024-07-18",
    "gpt-4.1": "gpt-4.1-2025-04-14",
    "gpt-4.1-mini": "gpt-4.1-mini-2025-04-14",
    "gpt-4.1-nano": "gpt-4.1-nano-2025-04-14",
    "gpt-5.2": "gpt-5.2",
    "gpt-5.1": "gpt-5.1",
    "gpt-5": "gpt-5",
    "o3": "o3-2025-04-16",
    "o4-mini": "o4-mini-2025-04-16",
    "claude-sonnet": "claude-sonnet-4-20250514",
    "claude-opus": "claude-opus-4-20250514",
    "claude-haiku": "claude-haiku-4-20250514",
    "claude-3.5-sonnet": "claude-3-5-sonnet-20241022",
    "claude-3.5-haiku": "claude-3-5-haiku-20241022",
    "qwen3": "Qwen/Qwen3-32B",
    "qwen3-32b": "Qwen/Qwen3-32B",
    "qwen3.5-35b": "Qwen/Qwen3.5-35B-A3B",
}


def strip_provider_prefix(model: str) -> str:
    """Remove LiteLLM-style ``provider/`` prefix."""
    for prefix in _provider_prefixes():
        if model.startswith(prefix):
            return model[len(prefix) :]
    return model


def resolve_alias(model: str) -> str:
    """Look up short alias; return canonical name or original."""
    key = model.strip().lower()
    for alias, canonical in _ALIASES.items():
        if key == alias.lower():
            return canonical
    return model


def resolve_model_name(model: str) -> str:
    """Full resolution: strip prefix, then resolve alias."""
    stripped = strip_provider_prefix(model.strip())
    return resolve_alias(stripped)


def fuzzy_match_model(
    configured: str,
    available: list[str],
) -> Optional[str]:
    """Find the best match for ``configured`` among ``available`` model IDs.

    Matching strategy (ordered by precision):
    1. Exact case-insensitive match
    2. Normalized match (strip `_`, `-`, `.`, `/`)
    3. Prefix match — ``configured`` is a prefix of an available model (e.g. ``gpt-4o`` matches ``gpt-4o-2024-11-20``)

    Does NOT use bidirectional substring matching to avoid false positives.
    """
    target = configured.strip().lower()

    for m in available:
        if m.lower() == target:
            return m

    target_norm = re.sub(r"[_\-./]", "", target)
    for m in available:
        if re.sub(r"[_\-./]", "", m.lower()) == target_norm:
            return m

    best: Optional[str] = None
    best_len = 0
    for m in available:
        ml = m.lower()
        if ml.startswith(target) and len(target) > best_len:
            best = m
            best_len = len(target)
        elif target.startswith(ml) and len(ml) > best_len:
            best = m
            best_len = len(ml)
    return best


def detect_config_drift(
    configured_model: str,
    available_models: list[str],
) -> Optional[str]:
    """Return a warning message if the configured model doesn't match any available model."""
    resolved = resolve_model_name(configured_model)
    matched = fuzzy_match_model(resolved, available_models)
    if matched:
        if matched != resolved:
            return (
                f"Configured model '{configured_model}' resolved to '{resolved}', "
                f"matched to '{matched}'. Consider setting llm.model={matched!r}"
            )
        return None

    if available_models:
        sample = ", ".join(available_models[:5])
        return (
            f"Configured model '{configured_model}' not found in endpoint models. "
            f"Available: {sample}. Check your llm.model setting."
        )
    return None
