"""OpenAI-compatible provider (works with vLLM, TGI, LMStudio, etc.)."""

from __future__ import annotations

import time
from typing import Any, Optional

import httpx

from kirakira_model_gateway.client import build_openai_compatible_url
from kirakira_model_gateway.providers.base import ModelProvider


class OpenAIProvider(ModelProvider):
    def __init__(
        self,
        base_url: str,
        api_key: str = "EMPTY",
        default_model: str = "gpt-4o-mini",
        timeout: int = 120,
        max_retries: int = 2,
    ) -> None:
        self.base_url = base_url.strip().rstrip("/")
        self.api_key = api_key
        self.default_model = default_model
        self.timeout = float(timeout)
        self.max_retries = max_retries

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _url(self, path: str) -> str:
        return build_openai_compatible_url(self.base_url, path)

    def complete(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if stop:
            payload["stop"] = stop

        last_err: Optional[Exception] = None
        for attempt in range(self.max_retries + 1):
            try:
                with httpx.Client(timeout=self.timeout, trust_env=False) as client:
                    resp = client.post(
                        self._url("/chat/completions"),
                        headers=self._headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    return resp.json()  # type: ignore[no-any-return]
            except (httpx.HTTPError, httpx.TimeoutException, OSError) as exc:
                last_err = exc
                if attempt < self.max_retries:
                    time.sleep(min(2 ** (attempt + 1), 8))
        raise last_err or RuntimeError("completion failed")

    def list_models(self) -> list[dict[str, Any]]:
        with httpx.Client(timeout=self.timeout, trust_env=False) as client:
            resp = client.get(self._url("/models"), headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, dict) and isinstance(data.get("data"), list):
            return data["data"]  # type: ignore[no-any-return]
        return []
