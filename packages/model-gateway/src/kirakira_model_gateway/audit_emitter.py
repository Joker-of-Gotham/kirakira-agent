"""Audit event emitter for model gateway calls."""

import json
import logging
import os
import socket as socket_mod
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class AuditEmitter:
    """Emits audit events for model gateway calls to the Kirakira audit ledger.
    
    Attempts IPC delivery to the kirakirad daemon first; falls back to local JSONL.
    """

    def __init__(
        self,
        socket_path: str | None = None,
        local_fallback_path: str | None = None,
        enabled: bool = True,
    ):
        self._ipc_socket_path = socket_path or os.path.expanduser("~/.kirakira/kirakirad.sock")
        home = os.path.expanduser("~/.kirakira")
        self._local_fallback_path = local_fallback_path or os.path.join(
            home, "audit", "model-gateway.jsonl"
        )
        self._enabled = enabled

    def emit(
        self,
        kind: str,
        provider: str,
        model: str,
        user_id: str = "unknown",
        session_id: str = "",
        trace_id: str = "",
        decision_id: str = "",
        status: str = "success",
        error_message: str = "",
        token_in: int = 0,
        token_out: int = 0,
        cost_usd: float = 0.0,
        latency_ms: float = 0.0,
    ) -> None:
        if not self._enabled:
            return

        event: dict[str, Any] = {
            "version": "kirakira.audit.v1",
            "event_id": f"evt_{os.urandom(8).hex()}",
            "ts": datetime.now(timezone.utc).isoformat(),
            "kind": kind,
            "actor": {
                "user_id": user_id,
                "interactive": True,
            },
            "subject": {
                "tool_type": "model",
                "tool_name": f"{provider}/{model}",
                "model_provider": provider,
                "model_name": model,
            },
            "result": {
                "status": status,
                "error_message": error_message if error_message else None,
            },
            "metrics": {
                "token_in": token_in,
                "token_out": token_out,
                "cost_usd": cost_usd,
                "latency_ms": latency_ms,
            },
        }

        if session_id:
            event["session_id"] = session_id
        if trace_id:
            event["trace_id"] = trace_id
        if decision_id:
            event["decision_id"] = decision_id

        if not self._try_ipc(event):
            self._write_local(event)

    def _try_ipc(self, event: dict[str, Any]) -> bool:
        """Attempt to deliver the audit event to kirakirad over Unix socket."""
        if not os.path.exists(self._ipc_socket_path):
            return False
        try:
            sock = socket_mod.socket(socket_mod.AF_UNIX, socket_mod.SOCK_STREAM)
            sock.settimeout(2.0)
            sock.connect(self._ipc_socket_path)
            rpc = {
                "jsonrpc": "2.0",
                "method": "audit.append",
                "params": {"event": event},
                "id": 1,
            }
            sock.sendall(json.dumps(rpc).encode("utf-8") + b"\n")
            sock.close()
            return True
        except Exception:
            logger.debug("IPC audit delivery failed, falling back to local JSONL")
            return False

    def _write_local(self, event: dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self._local_fallback_path), exist_ok=True)
        with open(self._local_fallback_path, "a") as fh:
            fh.write(json.dumps(event, default=str) + "\n")
