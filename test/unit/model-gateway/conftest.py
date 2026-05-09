"""Pytest setup: repo-root ``.env`` + ``packages/model-gateway/src`` on path.

Also provides a real local OpenAI-compatible HTTP server for integration tests
that need an LLM endpoint (list_models, chat completions).
"""

from __future__ import annotations

import json
import sys
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from typing import Generator

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[3]
_GW_SRC = _REPO_ROOT / "packages" / "model-gateway" / "src"

sys.path.insert(0, str(_GW_SRC))

try:
    from dotenv import load_dotenv

    load_dotenv(_REPO_ROOT / ".env", override=False)
except ImportError:
    pass


class _OpenAICompatHandler(BaseHTTPRequestHandler):
    """Minimal real HTTP handler implementing the OpenAI-compatible REST API."""

    def do_GET(self) -> None:
        if self.path in ("/v1/models", "/models"):
            body = json.dumps({
                "object": "list",
                "data": [
                    {"id": "test-model", "object": "model", "owned_by": "test"},
                    {"id": "gpt-4o-mini", "object": "model", "owned_by": "test"},
                ],
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def do_POST(self) -> None:
        if self.path in ("/v1/chat/completions", "/chat/completions"):
            content_len = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(content_len)
            req = json.loads(raw) if raw else {}

            model = req.get("model", "test-model")
            body = json.dumps({
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "model": model,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": "OK"},
                    "finish_reason": "stop",
                }],
                "usage": {"prompt_tokens": 5, "completion_tokens": 1, "total_tokens": 6},
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_error(404)

    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture(scope="session")
def openai_compat_server() -> Generator[str, None, None]:
    """Start a real local HTTP server that speaks the OpenAI-compatible API."""
    server = HTTPServer(("127.0.0.1", 0), _OpenAICompatHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}/v1"
    server.shutdown()
