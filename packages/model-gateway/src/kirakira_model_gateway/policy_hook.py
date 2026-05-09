"""Policy enforcement hook for model gateway calls."""

import json
import os
import socket
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class PolicyCheckResult:
    allowed: bool
    decision_id: str = ""
    effect: str = "deny"
    reason_codes: list[str] = field(default_factory=list)
    sandbox_profile: str = "read-only"
    obligations: list[dict[str, Any]] = field(default_factory=list)


class PolicyHook:
    """Checks model invocations against the Kirakira policy engine via kirakirad IPC."""

    def __init__(
        self,
        socket_path: str | None = None,
        enabled: bool = True,
        fallback_allow_readonly: bool = True,
    ):
        self._socket_path = socket_path or os.path.expanduser("~/.kirakira/kirakirad.sock")
        self._enabled = enabled
        self._fallback_allow_readonly = fallback_allow_readonly

    def check(
        self,
        provider: str,
        model: str,
        user_id: str = "unknown",
        session_id: str = "",
        trace_id: str = "",
        cost_tier: str = "standard",
        *,
        workspace_root: str | None = None,
    ) -> PolicyCheckResult:
        if not self._enabled:
            return PolicyCheckResult(allowed=True, effect="allow")

        root = workspace_root if workspace_root is not None else os.getcwd()
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        policy_input: dict[str, Any] = {
            "version": "kirakira.policyinput.v1",
            "request_id": f"req_{os.urandom(8).hex()}",
            "session_id": session_id,
            "trace_id": trace_id,
            "timestamp": now,
            "principal": {
                "user_id": user_id,
                "roles": [r.strip() for r in os.environ.get("KIRAKIRA_USER_ROLES", "developer").split(",") if r.strip()],
                "authn_method": os.environ.get("KIRAKIRA_AUTHN_METHOD", "token"),
                "device_trust": os.environ.get("KIRAKIRA_DEVICE_TRUST", "unknown"),
                "interactive": True,
            },
            "workspace": {
                "workspace_id": os.environ.get("KIRAKIRA_WORKSPACE_ID", "default"),
                "root": root,
            },
            "action": {
                "kind": "model.invoke",
                "tool_type": "model",
                "tool_name": f"{provider}/{model}",
                "operation": "chat.completions",
                "normalized": {
                    "flags": [],
                    "subcommands": [],
                    "write_paths": [],
                    "read_paths": [],
                    "destructive": False,
                    "interpreter_handoff": False,
                    "pipeline_depth": 0,
                    "redirection_targets": [],
                },
            },
            "context": {
                "model": {
                    "provider": provider,
                    "model": model,
                    "cost_tier": cost_tier,
                },
            },
        }

        try:
            return self._evaluate_via_ipc(policy_input)
        except Exception:
            if self._fallback_allow_readonly:
                return PolicyCheckResult(
                    allowed=True,
                    effect="allow",
                    reason_codes=["fallback_pdp_unavailable"],
                )
            return PolicyCheckResult(
                allowed=False,
                effect="deny",
                reason_codes=["pdp_unavailable"],
            )

    def _evaluate_via_ipc(self, policy_input: dict) -> PolicyCheckResult:
        """JSON-RPC newline framing; matches kirakirad server.go methodEvaluate (params.input == PolicyInput)."""
        request = {
            "jsonrpc": "2.0",
            "method": "evaluate",
            "params": {"input": policy_input},
            "id": 1,
        }

        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(3.0)
        try:
            sock.connect(self._socket_path)
            sock.sendall(json.dumps(request).encode("utf-8") + b"\n")

            response_data = b""
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response_data += chunk
                if b"\n" in response_data:
                    break

            raw_line = response_data.decode().split("\n", 1)[0].strip()
            response = json.loads(raw_line)

            if "error" in response:
                raise RuntimeError(str(response["error"].get("message", "IPC error")))

            raw_result = response.get("result")
            result_body = raw_result.get("decision") if isinstance(raw_result, dict) else raw_result

            sandbox_profile = "read-only"
            obligations: list[dict[str, Any]] = []
            allowed = False
            decision_id = ""
            reason_codes: list[str] = []
            effect = "deny"

            if isinstance(result_body, dict):
                decision_id = str(result_body.get("decision_id", "") or "")
                effect = str(result_body.get("effect", "deny") or "deny")
                reason_codes = list(result_body.get("reason_codes") or [])
                obligations = [
                    ob for ob in (result_body.get("obligations") or []) if isinstance(ob, dict)
                ]

                allowed = effect == "allow"

                for ob in obligations:
                    prof = ob.get("profile")
                    if isinstance(prof, str) and prof.strip():
                        sandbox_profile = prof
                        break

            elif result_body is not None:
                raise RuntimeError("Unexpected PDP IPC result shape")

            return PolicyCheckResult(
                allowed=allowed,
                decision_id=decision_id,
                effect=effect,
                reason_codes=reason_codes,
                sandbox_profile=sandbox_profile,
                obligations=obligations,
            )
        finally:
            sock.close()
