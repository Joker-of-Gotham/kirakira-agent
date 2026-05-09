"""LLM endpoint health probes (V3 preflight-style checks)."""

from __future__ import annotations

import time
from typing import Any, Optional

from kirakira_model_gateway.client import OpenAICompatClient
from kirakira_model_gateway.types import HealthStatus


def _sample_model_ids(payload: Any, limit: int = 8) -> list[str]:
    out: list[str] = []
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        for item in payload["data"][:limit]:
            if isinstance(item, dict) and "id" in item:
                out.append(str(item["id"]))
    return out


def check_health(
    base_url: str,
    *,
    api_key: str = "EMPTY",
    model: str = "Qwen/Qwen3.5-35B-A3B",
    timeout: int = 120,
) -> HealthStatus:
    """List ``/v1/models``, then run a minimal chat completion — uses a server-advertised model id when available."""
    root = base_url.strip().rstrip("/")
    t0 = time.perf_counter()
    chat_ok = False
    models_ok = False
    chat_latency: Optional[float] = None
    models_latency: Optional[float] = None
    models_sample: list[str] = []
    err: Optional[str] = None

    client = OpenAICompatClient(root, api_key=api_key, model=model, timeout=timeout, max_retries=1)

    t_mod0 = time.perf_counter()
    models = client.list_models()
    if models is None:
        err = "models: request failed"
        models_ok = False
    else:
        models_sample = _sample_model_ids({"data": models})
        models_ok = True
    models_latency = (time.perf_counter() - t_mod0) * 1000.0

    model_for_chat = model
    if models_sample:
        model_for_chat = models_sample[0]

    t_chat0 = time.perf_counter()
    try:
        # Very short ``max_tokens`` can yield empty generations on some stacks; keep >= 128.
        r = client.complete("Say OK", temperature=0.0, max_tokens=128, model=model_for_chat)
        chat_ok = r is not None and len(r) > 0
        if not chat_ok:
            err = err or f"chat: empty response (model={model_for_chat!r})"
    except Exception as exc:
        err = err or f"chat: {exc}"
    chat_latency = (time.perf_counter() - t_chat0) * 1000.0

    latency_ms = (time.perf_counter() - t0) * 1000.0
    ok = chat_ok and models_ok
    return HealthStatus(
        ok=ok,
        latency_ms=latency_ms,
        chat_ok=chat_ok,
        models_ok=models_ok,
        chat_latency_ms=chat_latency,
        models_latency_ms=models_latency,
        error=None if ok else (err or "health check failed"),
        active_base_url=root,
        models_sample=models_sample,
    )
