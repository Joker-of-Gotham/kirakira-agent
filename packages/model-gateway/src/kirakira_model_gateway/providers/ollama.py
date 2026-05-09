"""Ollama provider via its OpenAI-compatible endpoint."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from kirakira_model_gateway.providers.base import ModelProvider


class OllamaProvider(ModelProvider):
    def __init__(
        self,
        base_url: str = "http://localhost:11434/v1",
        model: str = "llama3",
        timeout: int = 120,
    ) -> None:
        self.base_url = base_url.strip().rstrip("/")
        self.model = model
        self.timeout = float(timeout)

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}/chat/completions"
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if stop:
            payload["stop"] = stop

        with httpx.Client(timeout=self.timeout, trust_env=False) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            return resp.json()  # type: ignore[no-any-return]

    def list_models(self) -> list[dict[str, Any]]:
        url = f"{self.base_url}/models"
        with httpx.Client(timeout=self.timeout, trust_env=False) as client:
            resp = client.get(url)
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]  # type: ignore[no-any-return]
        if isinstance(data, dict) and isinstance(data.get("models"), list):
            return [{"id": m.get("name", m.get("model", "")), "object": "model"} for m in data["models"]]
        return []
