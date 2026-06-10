"""Shared model metadata catalog loaded from the TypeScript core source.

The TypeScript side owns ``packages/core/src/model-metadata.catalog.json``.
Python reads the same JSON so aliases, capabilities, context windows, pricing,
and embedding/tool support do not drift between runtimes.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Optional


CATALOG_ENV = "KIRAKIRA_MODEL_METADATA_CATALOG"


@dataclass(frozen=True)
class ModelPricingMetadata:
    input_per_million_usd: float
    output_per_million_usd: float

    @classmethod
    def from_json(cls, value: Mapping[str, object]) -> "ModelPricingMetadata":
        return cls(
            input_per_million_usd=float(value["inputPerMillionUsd"]),
            output_per_million_usd=float(value["outputPerMillionUsd"]),
        )


@dataclass(frozen=True)
class ModelCapabilityMetadata:
    function_calling: bool = False
    structured_output: bool = False
    vision: bool = False
    batch: bool = False
    streaming: bool = True
    mcp_tools: bool = False
    reasoning: bool = False
    memory: bool = False
    tool_search: bool = False
    embedding: bool = False
    long_context: bool = False
    requires_approval: bool = False

    @classmethod
    def from_json(cls, value: Mapping[str, object]) -> "ModelCapabilityMetadata":
        return cls(
            function_calling=bool(value.get("functionCalling", False)),
            structured_output=bool(value.get("structuredOutput", False)),
            vision=bool(value.get("vision", False)),
            batch=bool(value.get("batch", False)),
            streaming=bool(value.get("streaming", True)),
            mcp_tools=bool(value.get("mcpTools", False)),
            reasoning=bool(value.get("reasoning", False)),
            memory=bool(value.get("memory", False)),
            tool_search=bool(value.get("toolSearch", False)),
            embedding=bool(value.get("embedding", False)),
            long_context=bool(value.get("longContext", False)),
            requires_approval=bool(value.get("requiresApproval", False)),
        )


@dataclass(frozen=True)
class ModelClassMetadata:
    price: str = "medium"
    latency: str = "medium"
    data_residency: str = "us"

    @classmethod
    def from_json(cls, value: Mapping[str, object]) -> "ModelClassMetadata":
        return cls(
            price=str(value.get("price", "medium")),
            latency=str(value.get("latency", "medium")),
            data_residency=str(value.get("dataResidency", "us")),
        )


@dataclass(frozen=True)
class ModelMetadataEntry:
    id: str
    provider: str
    aliases: tuple[str, ...]
    context_window: int
    max_output_tokens: int
    capabilities: ModelCapabilityMetadata
    classes: ModelClassMetadata
    pricing: Optional[ModelPricingMetadata] = None

    @classmethod
    def from_json(cls, value: Mapping[str, object]) -> "ModelMetadataEntry":
        raw_pricing = value.get("pricing")
        raw_capabilities = value.get("capabilities")
        raw_classes = value.get("classes")
        return cls(
            id=str(value["id"]),
            provider=str(value["provider"]),
            aliases=tuple(str(alias) for alias in value.get("aliases", [])),
            context_window=int(value.get("contextWindow", 8192)),
            max_output_tokens=int(value.get("maxOutputTokens", 4096)),
            capabilities=ModelCapabilityMetadata.from_json(
                raw_capabilities if isinstance(raw_capabilities, Mapping) else {},
            ),
            classes=ModelClassMetadata.from_json(
                raw_classes if isinstance(raw_classes, Mapping) else {},
            ),
            pricing=ModelPricingMetadata.from_json(raw_pricing)
            if isinstance(raw_pricing, Mapping)
            else None,
        )


@dataclass(frozen=True)
class ModelMetadataCatalog:
    schema_version: int
    sources: tuple[str, ...]
    aliases: Mapping[str, str]
    models: tuple[ModelMetadataEntry, ...]

    def resolve_alias(self, model: str) -> str:
        key = _model_key(model)
        if key in self.aliases:
            return self.aliases[key]
        for entry in self.models:
            if _model_key(entry.id) == key:
                return entry.id
            if any(_model_key(alias) == key for alias in entry.aliases):
                return entry.id
        return model.strip()

    def get_model(self, model: str) -> Optional[ModelMetadataEntry]:
        resolved = self.resolve_alias(model)
        key = _model_key(resolved)
        for entry in self.models:
            if _model_key(entry.id) == key:
                return entry
            if any(_model_key(alias) == key for alias in entry.aliases):
                return entry
        return None


def load_model_metadata_catalog(path: str | Path | None = None) -> ModelMetadataCatalog:
    catalog_path = resolve_model_metadata_catalog_path(path)
    payload = json.loads(catalog_path.read_text(encoding="utf-8"))
    return ModelMetadataCatalog(
        schema_version=int(payload.get("schemaVersion", 1)),
        sources=tuple(str(source) for source in payload.get("sources", [])),
        aliases={
            _model_key(str(alias)): str(target)
            for alias, target in payload.get("aliases", {}).items()
        },
        models=tuple(
            ModelMetadataEntry.from_json(entry) for entry in payload.get("models", [])
        ),
    )


def resolve_model_metadata_catalog_path(path: str | Path | None = None) -> Path:
    explicit = path or os.environ.get(CATALOG_ENV)
    if explicit:
        return Path(explicit).expanduser().resolve()

    current = Path(__file__).resolve()
    for parent in current.parents:
        candidate = parent / "packages" / "core" / "src" / "model-metadata.catalog.json"
        if candidate.exists():
            return candidate
    raise FileNotFoundError(
        "Unable to locate packages/core/src/model-metadata.catalog.json; "
        f"set {CATALOG_ENV} to an explicit catalog path."
    )


def resolve_model_alias(model: str) -> str:
    return load_model_metadata_catalog().resolve_alias(model)


def get_model_metadata(model: str) -> Optional[ModelMetadataEntry]:
    return load_model_metadata_catalog().get_model(model)


def _model_key(value: str) -> str:
    return value.strip().lower()


__all__ = [
    "CATALOG_ENV",
    "ModelCapabilityMetadata",
    "ModelClassMetadata",
    "ModelMetadataCatalog",
    "ModelMetadataEntry",
    "ModelPricingMetadata",
    "get_model_metadata",
    "load_model_metadata_catalog",
    "resolve_model_alias",
    "resolve_model_metadata_catalog_path",
]
