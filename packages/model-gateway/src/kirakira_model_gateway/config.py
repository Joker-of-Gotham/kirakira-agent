"""Gateway configuration with ``${VAR:-default}`` expansion (V3 pattern)."""

from __future__ import annotations

import logging
import os
import re
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv

    def _load_dotenv_files() -> None:
        load_dotenv(Path.cwd() / ".env", override=False)

except ImportError:
    def _load_dotenv_files() -> None:
        pass

_ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}")

_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "api_key_env": "OPENAI_API_KEY",
        "model": "gpt-5.2",
    },
    "aliyun-bailian": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "api_key_env": "DASHSCOPE_API_KEY",
        "model": "qwen3.6-plus",
    },
    "volcengine-ark": {
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "api_key_env": "ARK_API_KEY",
        "model": "doubao-seed-1-6-250615",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com",
        "api_key_env": "DEEPSEEK_API_KEY",
        "model": "deepseek-v4-flash",
    },
}

_PROVIDER_ALIASES: dict[str, str] = {
    "auto": "auto",
    "openai-platform": "openai",
    "bailian": "aliyun-bailian",
    "alibaba-bailian": "aliyun-bailian",
    "dashscope": "aliyun-bailian",
    "aliyun": "aliyun-bailian",
    "ark": "volcengine-ark",
    "volcano-ark": "volcengine-ark",
    "bytedance": "volcengine-ark",
    "byte": "volcengine-ark",
    "deepseek-official": "deepseek",
}


def _env_expand_str(value: str) -> str:
    """Expand ``${VAR}`` or ``${VAR:-default}`` in strings."""

    def repl(match: re.Match[str]) -> str:
        var = match.group(1)
        default = match.group(2)
        if var in os.environ and os.environ[var] != "":
            return os.environ[var]
        return default or ""

    return _ENV_PATTERN.sub(repl, value)


def _env_expand(obj: Any) -> Any:
    if isinstance(obj, str):
        return _env_expand_str(obj)
    if isinstance(obj, list):
        return [_env_expand(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _env_expand(v) for k, v in obj.items()}
    return obj


def _safe_int(env_key: str, default: int) -> int:
    raw = os.environ.get(env_key, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        raise ValueError(
            f"Environment variable {env_key}={raw!r} is not a valid integer"
        ) from None


def _safe_float(env_key: str, default: float) -> float:
    raw = os.environ.get(env_key, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        raise ValueError(
            f"Environment variable {env_key}={raw!r} is not a valid float"
        ) from None


def _get_env_str(name: str, default: str) -> str:
    raw = os.environ.get(name)
    if raw is None:
        return _env_expand_str(default)
    return _env_expand_str(raw)


def _normalize_provider_id(provider: str) -> str:
    normalized = provider.strip().lower()
    return _PROVIDER_ALIASES.get(normalized, normalized)


def _detect_provider_from_env(provider: str) -> str:
    normalized = _normalize_provider_id(provider or "auto")
    if normalized != "auto":
        return normalized

    detected = [
        provider_id
        for provider_id, defaults in _PROVIDER_DEFAULTS.items()
        if _get_env_str(defaults["api_key_env"], "").strip()
    ]
    if len(detected) == 1:
        return detected[0]
    return "openai"


def _provider_defaults(provider: str) -> dict[str, str]:
    return _PROVIDER_DEFAULTS.get(provider, _PROVIDER_DEFAULTS["openai"])


def _provider_api_key(provider: str, defaults: dict[str, str]) -> str:
    generic = _get_env_str("LLM_API_KEY", "").strip()
    specific = _get_env_str(defaults["api_key_env"], "").strip()
    if generic and generic != "EMPTY":
        return generic
    return specific or generic or "EMPTY"


def _parse_mirror_urls(raw: str) -> list[str]:
    if not raw.strip():
        return []
    parts = [x.strip() for x in raw.replace(";", ",").split(",")]
    return [p for p in parts if p]


class GatewayConfig(BaseModel):
    """Loaded from environment (after optional ``.env`` in CWD)."""

    provider: str = Field(default="openai", description="openai | azure | anthropic")
    base_url: str = Field(default="http://127.0.0.1:30000/v1")
    api_key: str = Field(default="EMPTY")
    model: str = Field(default="gpt-4o-mini")
    mirror_base_urls: list[str] = Field(default_factory=list)
    timeout: int = Field(default=120, ge=1, le=7200)
    num_retries: int = Field(default=3, ge=0, le=20)
    switch_on_error_count: int = Field(default=12, ge=1, le=200)
    switch_cooldown_sec: float = Field(default=60.0, ge=0.0, le=3600.0)
    azure_api_version: str = Field(default="2024-02-15-preview")
    anthropic_base_url: str = Field(default="https://api.anthropic.com")
    max_cost_per_session_usd: Optional[float] = Field(default=None)

    @classmethod
    def from_env(cls, *, env_path: Optional[Path] = None) -> "GatewayConfig":
        _load_dotenv_files()
        if env_path is not None:
            try:
                from dotenv import load_dotenv as _ld

                _ld(Path(env_path).expanduser().resolve(), override=False)
            except ImportError:
                logger.debug("python-dotenv not installed, skipping custom env_path=%s", env_path)

        mirror_raw = _get_env_str("LLM_MIRROR_BASE_URLS", "")
        cost_raw = _get_env_str("LLM_MAX_COST_PER_SESSION_USD", "")
        max_cost: Optional[float] = None
        if cost_raw.strip():
            try:
                max_cost = float(cost_raw.strip())
            except ValueError:
                logger.warning(
                    "LLM_MAX_COST_PER_SESSION_USD=%r is not a valid float, budget tracking disabled",
                    cost_raw,
                )
                max_cost = None

        provider = _detect_provider_from_env(_get_env_str("LLM_PROVIDER", "auto"))
        defaults = _provider_defaults(provider)
        base_url = _get_env_str("LLM_BASE_URL", "").strip().rstrip("/") or defaults["base_url"]
        model = _get_env_str("LLM_MODEL", "").strip() or defaults["model"]

        return cls(
            provider=provider,
            base_url=base_url,
            api_key=_provider_api_key(provider, defaults),
            model=model,
            mirror_base_urls=_parse_mirror_urls(mirror_raw),
            timeout=_safe_int("LLM_TIMEOUT", 120),
            num_retries=_safe_int("LLM_NUM_RETRIES", 3),
            switch_on_error_count=_safe_int("LLM_SWITCH_ON_ERROR_COUNT", 12),
            switch_cooldown_sec=_safe_float("LLM_SWITCH_COOLDOWN_SEC", 60.0),
            azure_api_version=_get_env_str("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
            anthropic_base_url=_get_env_str("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/"),
            max_cost_per_session_usd=max_cost,
        )

    def all_base_urls(self) -> list[str]:
        """Primary first, then mirrors (deduped, non-empty)."""
        primary = self.base_url.strip().rstrip("/")
        seen: set[str] = set()
        out: list[str] = []
        for u in [primary, *self.mirror_base_urls]:
            u = str(u).strip().rstrip("/")
            if not u or u in seen:
                continue
            seen.add(u)
            out.append(u)
        return out

    def mirror_config(self) -> "MirrorConfig":
        from kirakira_model_gateway.types import MirrorConfig

        urls = self.all_base_urls()
        return MirrorConfig(
            base_urls=urls,
            switch_on_error_count=self.switch_on_error_count,
            switch_cooldown_sec=self.switch_cooldown_sec,
            active_idx=0,
        )


__all__ = [
    "GatewayConfig",
    "_env_expand",
    "_env_expand_str",
]
