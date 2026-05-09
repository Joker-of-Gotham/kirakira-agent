"""Kirakira model gateway: OpenAI-compatible LLM access via JSON-RPC over stdio."""

from __future__ import annotations

__version__ = "0.1.0"

from kirakira_model_gateway.client import OpenAICompatClient, extract_json
from kirakira_model_gateway.config import GatewayConfig
from kirakira_model_gateway.health import check_health
from kirakira_model_gateway.mirror import MirrorSelector, is_transient_error
from kirakira_model_gateway.provider import create_provider
from kirakira_model_gateway.model_resolver import resolve_model_name, detect_config_drift, strip_provider_prefix
from kirakira_model_gateway.capability import ModelCapability, ModelCapabilityRegistry
from kirakira_model_gateway.cost import CostTracker, CostEntry, estimate_cost
from kirakira_model_gateway.server import GatewayServer, main, process_line, run_stdio_loop
from kirakira_model_gateway.types import (
    CompletionRequest,
    CompletionResult,
    HealthStatus,
    MirrorConfig,
    ModelInfo,
)

__all__ = [
    "__version__",
    "CompletionRequest",
    "CompletionResult",
    "CostEntry",
    "CostTracker",
    "GatewayConfig",
    "GatewayServer",
    "HealthStatus",
    "MirrorConfig",
    "MirrorSelector",
    "ModelCapability",
    "ModelCapabilityRegistry",
    "ModelInfo",
    "OpenAICompatClient",
    "check_health",
    "create_provider",
    "detect_config_drift",
    "estimate_cost",
    "extract_json",
    "is_transient_error",
    "main",
    "process_line",
    "resolve_model_name",
    "run_stdio_loop",
    "strip_provider_prefix",
]
