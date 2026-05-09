"""Anthropic (Claude) provider via the Messages API."""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx

from kirakira_model_gateway.providers.base import ModelProvider


class AnthropicProvider(ModelProvider):
    def __init__(
        self,
        base_url: str = "https://api.anthropic.com",
        api_key: str = "",
        timeout: int = 120,
    ) -> None:
        self.base_url = base_url.strip().rstrip("/")
        self.api_key = api_key
        self.timeout = float(timeout)

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
        }

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        system_msgs = [m for m in messages if m.get("role") == "system"]
        user_msgs = [m for m in messages if m.get("role") != "system"]
        system_text = "\n".join(m.get("content", "") for m in system_msgs) or None

        payload: dict[str, Any] = {
            "model": model or "claude-sonnet-4-20250514",
            "max_tokens": max_tokens,
            "messages": [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in user_msgs],
        }
        if system_text:
            payload["system"] = system_text
        if stop:
            payload["stop_sequences"] = stop

        url = f"{self.base_url}/v1/messages"
        with httpx.Client(timeout=self.timeout, trust_env=False) as client:
            resp = client.post(url, headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()

        content_blocks = data.get("content", [])
        text_parts = [b.get("text", "") for b in content_blocks if b.get("type") == "text"]
        text = "".join(text_parts)

        return {
            "choices": [{
                "message": {"role": "assistant", "content": text},
                "finish_reason": data.get("stop_reason", "end_turn"),
            }],
            "usage": {
                "prompt_tokens": data.get("usage", {}).get("input_tokens", 0),
                "completion_tokens": data.get("usage", {}).get("output_tokens", 0),
                "total_tokens": (
                    data.get("usage", {}).get("input_tokens", 0)
                    + data.get("usage", {}).get("output_tokens", 0)
                ),
            },
            "model": data.get("model", model),
        }

    def list_models(self) -> list[dict[str, Any]]:
        url = f"{self.base_url}/v1/models"
        try:
            with httpx.Client(timeout=self.timeout, trust_env=False) as client:
                resp = client.get(url, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, dict) and isinstance(data.get("data"), list):
                    return [{"id": m.get("id", ""), "object": "model", "owned_by": "anthropic"} for m in data["data"]]
        except Exception:
            pass
        return [
            {"id": "claude-sonnet-4-20250514", "object": "model", "owned_by": "anthropic"},
            {"id": "claude-opus-4-20250514", "object": "model", "owned_by": "anthropic"},
            {"id": "claude-3-5-haiku-20241022", "object": "model", "owned_by": "anthropic"},
        ]
