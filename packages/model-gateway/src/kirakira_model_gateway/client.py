"""OpenAI-compatible HTTP client for chat completions and model listing."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Optional
from urllib.parse import urlsplit, urlunsplit

import httpx

logger = logging.getLogger(__name__)

_VERSIONED_BASE_SUFFIXES = ("/v1", "/api/v3", "/compatible-mode/v1")


def build_openai_compatible_url(base_url: str, endpoint_path: str) -> str:
    """Build a provider-aware OpenAI-compatible endpoint URL.

    Official providers do not all use the same version prefix:
    OpenAI uses /v1, DashScope uses /compatible-mode/v1, Volcano Ark uses
    /api/v3, and DeepSeek documents the root API base.
    """
    base = base_url.strip().rstrip("/")
    if not base:
        return ""

    path = "/" + endpoint_path.strip("/")
    if base.endswith(path):
        return base

    parsed = urlsplit(base)
    host = parsed.netloc.lower()
    base_path = parsed.path.rstrip("/")

    if base_path.endswith(_VERSIONED_BASE_SUFFIXES):
        api_path = base_path
    elif host == "api.openai.com":
        api_path = f"{base_path}/v1"
    elif host == "api.deepseek.com":
        api_path = base_path
    elif host.endswith("dashscope.aliyuncs.com"):
        api_path = f"{base_path}/compatible-mode/v1"
    elif host == "ark.cn-beijing.volces.com":
        api_path = f"{base_path}/api/v3"
    else:
        api_path = f"{base_path}/v1"

    full_path = f"{api_path.rstrip('/')}{path}"
    return urlunsplit((parsed.scheme, parsed.netloc, full_path, parsed.query, parsed.fragment))


def _build_messages(
    prompt: str,
    system_prompt: Optional[str] = None,
) -> list[dict[str, str]]:
    """Build the ``messages`` array for an OpenAI-compatible chat completion."""
    msgs: list[dict[str, str]] = []
    if system_prompt is not None:
        msgs.append({"role": "system", "content": system_prompt})
    msgs.append({"role": "user", "content": prompt})
    return msgs


def extract_json(text: str) -> Any:
    """Extract the first JSON object or array from ``text``.

    Handles:
    - Raw JSON: ``{"a": 1}`` or ``[1,2]``
    - Fenced code blocks: ````json\\n{...}\\n```
    - Embedded JSON within prose

    Returns ``None`` if no valid JSON is found.
    """
    stripped = text.strip()

    fence_match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)```", stripped)
    if fence_match:
        candidate = fence_match.group(1).strip()
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            pass

    for start_char, end_char in (("{", "}"), ("[", "]")):
        start = stripped.find(start_char)
        if start == -1:
            continue
        end = stripped.rfind(end_char)
        if end <= start:
            continue
        candidate = stripped[start : end + 1]
        try:
            return json.loads(candidate)
        except (json.JSONDecodeError, ValueError):
            continue

    return None


class OpenAICompatClient:
    """Synchronous client for OpenAI-compatible chat/completions endpoints.

    Returns ``None`` on connection failures instead of raising, making it safe
    for health probes and best-effort completions.
    """

    def __init__(
        self,
        base_url: str,
        *,
        api_key: str = "EMPTY",
        model: str = "gpt-4o-mini",
        timeout: int = 120,
        max_retries: int = 2,
    ) -> None:
        self.base_url = base_url.strip().rstrip("/") if base_url else ""
        self.api_key = api_key
        self.model = model
        self.timeout = float(timeout)
        self.max_retries = max_retries

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _completions_url(self) -> str:
        return build_openai_compatible_url(self.base_url, "/chat/completions")

    def _models_url(self) -> str:
        return build_openai_compatible_url(self.base_url, "/models")

    def complete(
        self,
        prompt: str,
        *,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        stop: Optional[list[str]] = None,
    ) -> Optional[str]:
        """Run a chat completion. Returns generated text or ``None`` on failure."""
        if not self.base_url:
            return None

        messages = _build_messages(prompt, system_prompt=system_prompt)
        payload: dict[str, Any] = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if stop:
            payload["stop"] = stop

        attempt = 0
        last_err: Optional[Exception] = None
        while attempt <= self.max_retries:
            try:
                with httpx.Client(timeout=self.timeout, trust_env=False) as client:
                    resp = client.post(
                        self._completions_url(),
                        headers=self._headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices:
                        msg = choices[0].get("message", {})
                        content = msg.get("content")
                        if content is not None:
                            return str(content)
                        reasoning = msg.get("reasoning_content")
                        if reasoning is not None:
                            return str(reasoning)
                    return ""
            except (httpx.HTTPError, httpx.TimeoutException, OSError) as exc:
                last_err = exc
                attempt += 1
                if attempt <= self.max_retries:
                    time.sleep(min(2 ** attempt, 8))

        if last_err:
            logger.debug("OpenAICompatClient.complete failed: %s", last_err)
        return None

    def list_models(self) -> Optional[list[dict[str, Any]]]:
        """List available models. Returns ``None`` on failure."""
        if not self.base_url:
            return None

        attempt = 0
        last_err: Optional[Exception] = None
        while attempt <= self.max_retries:
            try:
                with httpx.Client(timeout=self.timeout, trust_env=False) as client:
                    resp = client.get(self._models_url(), headers=self._headers())
                    resp.raise_for_status()
                    data = resp.json()
                    if isinstance(data, dict) and isinstance(data.get("data"), list):
                        return data["data"]  # type: ignore[no-any-return]
                    return []
            except (httpx.HTTPError, httpx.TimeoutException, OSError) as exc:
                last_err = exc
                attempt += 1
                if attempt <= self.max_retries:
                    time.sleep(min(2 ** attempt, 8))

        if last_err:
            logger.debug("OpenAICompatClient.list_models failed: %s", last_err)
        return None

    def estimate_tokens(self, text: str) -> int:
        """Rough token count estimate (~4 chars/token for English)."""
        return max(1, len(text) // 4)
