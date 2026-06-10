"""Shared model provider catalog loaded from the TypeScript core source.

The TypeScript side owns ``packages/core/src/model-providers.catalog.json``.
Python reads the same JSON so provider ids, aliases, default URLs, key env vars,
and endpoint path rules do not drift between runtimes.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional
from urllib.parse import urlsplit, urlunsplit


CATALOG_ENV = "KIRAKIRA_MODEL_PROVIDER_CATALOG"


@dataclass(frozen=True)
class ModelProviderCatalogEntry:
    id: str
    label: str
    key_env: str
    base_url: str
    models_endpoint: str
    default_model: str
    fallback_models: tuple[str, ...]

    @classmethod
    def from_json(cls, value: Mapping[str, object]) -> "ModelProviderCatalogEntry":
        return cls(
            id=str(value["id"]),
            label=str(value.get("label", value["id"])),
            key_env=str(value["keyEnv"]),
            base_url=str(value["baseUrl"]).rstrip("/"),
            models_endpoint=str(value.get("modelsEndpoint", "/models")),
            default_model=str(value["defaultModel"]),
            fallback_models=tuple(str(item) for item in value.get("fallbackModels", [])),
        )


@dataclass(frozen=True)
class ModelProviderCatalog:
    providers: tuple[ModelProviderCatalogEntry, ...]
    aliases: Mapping[str, str]

    def normalize_provider_id(self, provider: str | None) -> Optional[str]:
        if not provider:
            return None
        normalized = provider.strip().lower()
        aliased = self.aliases.get(normalized)
        if aliased is not None:
            return aliased
        if any(entry.id == normalized for entry in self.providers):
            return normalized
        return None

    def get_provider(self, provider: str | None) -> Optional[ModelProviderCatalogEntry]:
        provider_id = self.normalize_provider_id(provider)
        if not provider_id or provider_id == "auto":
            return None
        return next((entry for entry in self.providers if entry.id == provider_id), None)

    def provider_ids(self) -> tuple[str, ...]:
        return tuple(entry.id for entry in self.providers)

    def openai_compatible_aliases(self) -> frozenset[str]:
        provider_ids = set(self.provider_ids())
        aliases = {
            alias
            for alias, target in self.aliases.items()
            if target in provider_ids and target != "auto"
        }
        return frozenset((*provider_ids, *aliases))

    def versioned_base_suffixes(self) -> tuple[str, ...]:
        suffixes: set[str] = set()
        for entry in self.providers:
            path = urlsplit(entry.base_url).path.rstrip("/")
            if path:
                suffixes.add(path)
        return tuple(sorted(suffixes, key=len, reverse=True))

    def host_base_paths(self) -> Mapping[str, str]:
        return {
            urlsplit(entry.base_url).netloc.lower(): urlsplit(entry.base_url).path.rstrip("/")
            for entry in self.providers
        }


def load_model_provider_catalog(path: str | Path | None = None) -> ModelProviderCatalog:
    catalog_path = resolve_model_provider_catalog_path(path)
    payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    return ModelProviderCatalog(
        providers=tuple(
            ModelProviderCatalogEntry.from_json(entry) for entry in payload.get("providers", [])
        ),
        aliases={str(alias).lower(): str(target) for alias, target in payload.get("aliases", {}).items()},
    )


def resolve_model_provider_catalog_path(path: str | Path | None = None) -> Path:
    explicit = path or os.environ.get(CATALOG_ENV)
    if explicit:
        return Path(explicit).expanduser().resolve()

    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "packages" / "core" / "src" / "model-providers.catalog.json"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Unable to locate packages/core/src/model-providers.catalog.json; "
        f"set {CATALOG_ENV} to an explicit catalog path."
    )


def normalize_model_provider_id(provider: str | None) -> Optional[str]:
    return load_model_provider_catalog().normalize_provider_id(provider)


def get_model_provider(provider: str | None) -> Optional[ModelProviderCatalogEntry]:
    return load_model_provider_catalog().get_provider(provider)


def detect_model_provider(env: Mapping[str, str | None] = os.environ) -> ModelProviderCatalogEntry:
    catalog = load_model_provider_catalog()
    explicit = catalog.get_provider(env.get("LLM_PROVIDER"))
    if explicit is not None:
        return explicit

    detected = [
        entry
        for entry in catalog.providers
        if is_usable_model_api_key(env.get(entry.key_env))
    ]
    return detected[0] if len(detected) == 1 else catalog.providers[0]


def is_usable_model_api_key(value: str | None) -> bool:
    trimmed = (value or "").strip()
    return bool(trimmed and trimmed not in {"EMPTY", "your-api-key"})


def get_model_provider_key(
    provider: ModelProviderCatalogEntry,
    env: Mapping[str, str | None] = os.environ,
    *,
    prefer_generic: bool = True,
) -> str:
    generic = (env.get("LLM_API_KEY") or "").strip()
    specific = (env.get(provider.key_env) or "").strip()
    if prefer_generic and is_usable_model_api_key(generic):
        return generic
    if is_usable_model_api_key(specific):
        return specific
    if is_usable_model_api_key(generic):
        return generic
    return specific or generic or "EMPTY"


def build_openai_compatible_url(base_url: str, endpoint_path: str) -> str:
    base = base_url.strip().rstrip("/")
    if not base:
        return ""

    path = "/" + endpoint_path.strip("/")
    if base.endswith(path):
        return base

    catalog = load_model_provider_catalog()
    parsed = urlsplit(base)
    host = parsed.netloc.lower()
    base_path = parsed.path.rstrip("/")

    if any(base_path.endswith(suffix) for suffix in catalog.versioned_base_suffixes()):
        api_path = base_path
    else:
        api_path = catalog.host_base_paths().get(host, f"{base_path}/v1")

    full_path = f"{api_path.rstrip('/')}{path}"
    return urlunsplit((parsed.scheme, parsed.netloc, full_path, parsed.query, parsed.fragment))


__all__ = [
    "CATALOG_ENV",
    "ModelProviderCatalog",
    "ModelProviderCatalogEntry",
    "build_openai_compatible_url",
    "detect_model_provider",
    "get_model_provider",
    "get_model_provider_key",
    "is_usable_model_api_key",
    "load_model_provider_catalog",
    "normalize_model_provider_id",
    "resolve_model_provider_catalog_path",
]
