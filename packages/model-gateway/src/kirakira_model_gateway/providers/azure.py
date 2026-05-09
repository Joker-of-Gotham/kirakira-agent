"""Azure OpenAI provider."""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx

from kirakira_model_gateway.providers.base import ModelProvider


class AzureProvider(ModelProvider):
    def __init__(
        self,
        endpoint: str,
        api_key: str,
        api_version: str = "2024-02-15-preview",
        timeout: int = 120,
        max_retries: int = 2,
    ) -> None:
        self.endpoint = endpoint.strip().rstrip("/")
        self.api_key = api_key
        self.api_version = api_version
        self.timeout = float(timeout)
        self.max_retries = max_retries

    def _headers(self) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "api-key": self.api_key,
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
        deployment = model or "gpt-4o"
        url = (
            f"{self.endpoint}/openai/deployments/{deployment}"
            f"/chat/completions?api-version={self.api_version}"
        )
        payload: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if stop:
            payload["stop"] = stop

        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout, trust_env=False) as client:
                    resp = client.post(url, headers=self._headers(), json=payload)
                    resp.raise_for_status()
                    return resp.json()  # type: ignore[no-any-return]
            except (httpx.HTTPError, httpx.TimeoutException, OSError) as exc:
                last_err = exc
                if attempt < self.max_retries:
                    time.sleep(min(2 ** (attempt + 1), 8))
        raise last_err or RuntimeError("Azure completion failed")

    def list_models(self) -> list[dict[str, Any]]:
        url = f"{self.endpoint}/openai/models?api-version={self.api_version}"
        with httpx.Client(timeout=self.timeout, trust_env=False) as client:
            resp = client.get(url, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]  # type: ignore[no-any-return]
        return []
