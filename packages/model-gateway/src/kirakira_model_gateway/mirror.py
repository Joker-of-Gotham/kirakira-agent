"""Mirror endpoint rotation on transient failures (V3 compiler pattern)."""

from __future__ import annotations

import logging
import threading
import time
from typing import Optional

from kirakira_model_gateway.types import MirrorConfig

logger = logging.getLogger(__name__)


_TRANSIENT_HTTP_CODES = frozenset({429, 502, 503, 504})

_TRANSIENT_MESSAGE_PATTERNS = (
    "connection error",
    "timeout",
    "timed out",
    "service unavailable",
    "temporarily unavailable",
    "upstream",
    "bad gateway",
    "gateway timeout",
    "network",
    "connecterror",
    "readtimeout",
    "remoteprotocolerror",
)


def is_transient_error(exc: BaseException) -> bool:
    """Classify whether an exception indicates a transient / retryable failure.

    Uses two strategies:
    1. Check for an HTTP status code on the exception object (httpx, openai, etc.).
    2. Fall back to message pattern matching for non-HTTP exceptions (DNS, socket, etc.).
    """
    import httpx as _httpx

    if isinstance(exc, _httpx.HTTPStatusError):
        return exc.response.status_code in _TRANSIENT_HTTP_CODES
    if isinstance(exc, (_httpx.ConnectError, _httpx.ConnectTimeout, _httpx.ReadTimeout, _httpx.PoolTimeout)):
        return True

    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if isinstance(status, int) and status in _TRANSIENT_HTTP_CODES:
        return True

    s = str(exc).lower()
    return any(m in s for m in _TRANSIENT_MESSAGE_PATTERNS)


class MirrorSelector:
    """Tracks transient errors and rotates active OpenAI-compatible base URL."""

    def __init__(self, cfg: MirrorConfig) -> None:
        self._cfg = cfg.model_copy(deep=True)
        self._lock = threading.Lock()
        self._urls = self._cfg.normalized_urls()
        if self._cfg.active_idx >= len(self._urls):
            self._cfg.active_idx = max(0, len(self._urls) - 1)
        self._transient_error_count = 0
        self._last_switch_ts = 0.0

    def snapshot_config(self) -> MirrorConfig:
        with self._lock:
            return self._cfg.model_copy(deep=True)

    def current_base_url(self) -> Optional[str]:
        with self._lock:
            if not self._urls:
                return None
            idx = min(self._cfg.active_idx, len(self._urls) - 1)
            return self._urls[idx]

    def record_success(self) -> None:
        with self._lock:
            if self._transient_error_count > 0:
                self._transient_error_count = max(0, self._transient_error_count - 1)

    def record_transient_failure(self, reason: str) -> bool:
        """Increment error counter; rotate when threshold reached. Returns True if switched."""
        logger.debug("transient failure recorded: %s", reason[:200])
        with self._lock:
            if len(self._urls) <= 1:
                return False
            self._transient_error_count += 1
            threshold = max(1, int(self._cfg.switch_on_error_count))
            if self._transient_error_count < threshold:
                return False
            cooldown = max(0.0, float(self._cfg.switch_cooldown_sec))
            now = time.monotonic()
            if now - self._last_switch_ts < cooldown:
                return False
            active_idx = int(self._cfg.active_idx)
            next_idx = (active_idx + 1) % len(self._urls)
            if next_idx == active_idx:
                return False
            self._cfg.active_idx = next_idx
            self._last_switch_ts = now
            self._transient_error_count = 0
            return True

    def reset_errors(self) -> None:
        with self._lock:
            self._transient_error_count = 0
