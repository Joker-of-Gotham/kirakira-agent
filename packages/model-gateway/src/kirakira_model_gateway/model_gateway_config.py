"""Dedicated model gateway configuration."""

import os
from dataclasses import dataclass, field
from pathlib import Path

import tomllib


@dataclass
class ModelGatewayConfig:
    policy_check_enabled: bool = True
    audit_enabled: bool = True
    trace_enabled: bool = True
    otlp_endpoint: str | None = None
    kirakirad_socket_path: str = ""
    allowed_providers: list[str] = field(
        default_factory=lambda: [
            "openai",
            "aliyun-bailian",
            "volcengine-ark",
            "deepseek",
            "anthropic",
            "azure",
            "ollama",
            "vllm",
        ]
    )
    max_cost_per_session_usd: float = 10.0
    max_cost_per_day_usd: float = 50.0

    def __post_init__(self) -> None:
        if not self.kirakirad_socket_path:
            self.kirakirad_socket_path = os.path.expanduser("~/.kirakira/kirakirad.sock")

    @classmethod
    def load(cls, config_path: str | None = None) -> "ModelGatewayConfig":
        if config_path is None:
            config_path = os.path.expanduser("~/.kirakira/model_gateway.toml")

        cfg = cls()

        if val := os.environ.get("KIRAKIRA_GW_POLICY_CHECK"):
            cfg.policy_check_enabled = val.lower() in ("1", "true", "yes")
        if val := os.environ.get("KIRAKIRA_GW_AUDIT"):
            cfg.audit_enabled = val.lower() in ("1", "true", "yes")
        if val := os.environ.get("KIRAKIRA_GW_TRACE"):
            cfg.trace_enabled = val.lower() in ("1", "true", "yes")
        if val := os.environ.get("KIRAKIRA_GW_OTLP_ENDPOINT"):
            cfg.otlp_endpoint = val
        if val := os.environ.get("KIRAKIRA_GW_SOCKET"):
            cfg.kirakirad_socket_path = val

        if Path(config_path).exists():
            with open(config_path, "rb") as fh:
                data = tomllib.load(fh)
            if "policy" in data:
                cfg.policy_check_enabled = data["policy"].get(
                    "check_enabled", cfg.policy_check_enabled
                )
            if "audit" in data:
                cfg.audit_enabled = data["audit"].get("enabled", cfg.audit_enabled)
            if "trace" in data:
                cfg.trace_enabled = data["trace"].get("enabled", cfg.trace_enabled)
                cfg.otlp_endpoint = data["trace"].get(
                    "otlp_endpoint", cfg.otlp_endpoint
                )
            if "providers" in data:
                cfg.allowed_providers = data["providers"].get(
                    "allowed", cfg.allowed_providers
                )
            if "limits" in data:
                cfg.max_cost_per_session_usd = data["limits"].get(
                    "max_cost_per_session_usd", cfg.max_cost_per_session_usd
                )
                cfg.max_cost_per_day_usd = data["limits"].get(
                    "max_cost_per_day_usd", cfg.max_cost_per_day_usd
                )

        return cfg
