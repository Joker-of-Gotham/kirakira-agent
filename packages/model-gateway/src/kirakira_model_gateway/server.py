"""JSON-RPC over stdio gateway server.

Reads newline-delimited JSON-RPC 2.0 requests from stdin and writes responses to stdout.
Supports methods: ``complete``, ``estimate_tokens``, ``list_models``, ``health``.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any, Optional

from kirakira_model_gateway.client import OpenAICompatClient, _build_messages
from kirakira_model_gateway.config import GatewayConfig
from kirakira_model_gateway.health import check_health
from kirakira_model_gateway.mirror import MirrorSelector
from kirakira_model_gateway.model_resolver import resolve_model_name
from kirakira_model_gateway.types import CompletionRequest, CompletionResult

logger = logging.getLogger(__name__)


def _jsonrpc_response(id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": id, "result": result}


def _jsonrpc_error(id: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": id, "error": err}


class GatewayServer:
    """Stateful JSON-RPC gateway managing an OpenAI-compatible client."""

    def __init__(self, config: GatewayConfig) -> None:
        self.config = config
        self._mirror = MirrorSelector(config.mirror_config()) if len(config.all_base_urls()) > 1 else None
        self._client: Optional[OpenAICompatClient] = None
        self._init_client()

    @property
    def default_model(self) -> str:
        return self.config.model

    def _init_client(self) -> None:
        base_url = self._mirror.active_url() if self._mirror else self.config.base_url
        api_key = self.config.api_key
        model = self.default_model
        timeout = self.config.timeout
        max_retries = self.config.num_retries
        self._client = OpenAICompatClient(
            base_url,
            api_key=api_key,
            model=model,
            timeout=timeout,
            max_retries=max_retries,
        )

    def handle_request(self, request: dict[str, Any]) -> dict[str, Any]:
        """Dispatch a single JSON-RPC request."""
        req_id = request.get("id")
        method = request.get("method", "")
        params = request.get("params", {})

        if method == "complete":
            return self._handle_complete(req_id, params)
        elif method == "estimate_tokens":
            return self._handle_estimate_tokens(req_id, params)
        elif method == "list_models":
            return self._handle_list_models(req_id, params)
        elif method == "health":
            return self._handle_health(req_id, params)
        else:
            return _jsonrpc_error(req_id, -32601, f"Method not found: {method}")

    def _handle_complete(self, req_id: Any, params: dict[str, Any]) -> dict[str, Any]:
        prompt = params.get("prompt", "")
        if not prompt:
            return _jsonrpc_error(req_id, -32602, "Missing required param: prompt")

        model = params.get("model") or self.default_model
        resolved = resolve_model_name(model)
        system_prompt = params.get("systemPrompt") or params.get("system_prompt")
        temperature = params.get("temperature", 0.7)
        max_tokens = params.get("maxTokens") or params.get("max_tokens", 4096)

        t0 = time.perf_counter()
        text = self._client.complete(  # type: ignore[union-attr]
            prompt,
            system_prompt=system_prompt,
            model=resolved,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        latency_ms = (time.perf_counter() - t0) * 1000.0

        result = CompletionResult(
            text=text,
            model=resolved,
            raw_error=None if text is not None else "completion_failed",
            latency_ms=latency_ms,
        )
        return _jsonrpc_response(req_id, {
            "text": result.text,
            "model": result.model,
            "rawError": result.raw_error,
            "usage": result.usage,
            "latency_ms": result.latency_ms,
        })

    def _handle_estimate_tokens(self, req_id: Any, params: dict[str, Any]) -> dict[str, Any]:
        text = params.get("text", "")
        count = self._client.estimate_tokens(text) if self._client else max(1, len(text) // 4)  # type: ignore[union-attr]
        return _jsonrpc_response(req_id, {"tokens": count})

    def _handle_list_models(self, req_id: Any, params: dict[str, Any]) -> dict[str, Any]:
        models = self._client.list_models() if self._client else None  # type: ignore[union-attr]
        if models is None:
            return _jsonrpc_error(req_id, -32000, "Failed to list models")
        return _jsonrpc_response(req_id, {"models": models})

    def _handle_health(self, req_id: Any, params: dict[str, Any]) -> dict[str, Any]:
        status = check_health(
            self.config.base_url,
            api_key=self.config.api_key,
            model=self.default_model,
        )
        return _jsonrpc_response(req_id, {
            "ok": status.ok,
            "latency_ms": status.latency_ms,
            "chat_ok": status.chat_ok,
            "models_ok": status.models_ok,
            "error": status.error,
        })


def process_line(line: str, server: GatewayServer) -> Optional[str]:
    """Parse and handle a single JSON-RPC request line. Returns response JSON or None."""
    stripped = line.strip()
    if not stripped:
        return None
    try:
        request = json.loads(stripped)
    except json.JSONDecodeError as e:
        resp = _jsonrpc_error(None, -32700, f"Parse error: {e}")
        return json.dumps(resp)

    if not isinstance(request, dict):
        resp = _jsonrpc_error(None, -32600, "Invalid Request: not an object")
        return json.dumps(resp)

    response = server.handle_request(request)
    return json.dumps(response)


def run_stdio_loop(server: GatewayServer) -> None:
    """Blocking stdio read loop: reads JSON-RPC lines from stdin, writes to stdout."""
    for line in sys.stdin:
        result = process_line(line, server)
        if result is not None:
            sys.stdout.write(result + "\n")
            sys.stdout.flush()


def main(env_path: Optional[str] = None) -> None:
    """Entry point for the model gateway stdio server."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )
    from pathlib import Path

    path_arg = Path(env_path) if env_path else None
    config = GatewayConfig.from_env(env_path=path_arg)
    server = GatewayServer(config)
    logger.info(
        "Kirakira model gateway started (base_url=%s, model=%s)",
        config.base_url,
        config.model,
    )
    run_stdio_loop(server)
