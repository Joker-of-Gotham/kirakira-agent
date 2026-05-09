"""Per-request cost estimation and session-level budget tracking.

Token pricing from public rate cards (OpenAI, Anthropic, etc.).
Local/self-hosted models default to zero cost.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class TokenPrice:
    """Cost per million tokens (USD)."""
    input_per_m: float
    output_per_m: float


_PRICES: dict[str, TokenPrice] = {
    # OpenAI (2025 pricing)
    "gpt-4o": TokenPrice(2.50, 10.00),
    "gpt-4o-mini": TokenPrice(0.15, 0.60),
    "gpt-4.1": TokenPrice(2.00, 8.00),
    "gpt-4.1-mini": TokenPrice(0.40, 1.60),
    "gpt-4.1-nano": TokenPrice(0.10, 0.40),
    "o3": TokenPrice(10.00, 40.00),
    "o4-mini": TokenPrice(1.10, 4.40),

    # Anthropic (2025 pricing)
    "claude-sonnet-4-20250514": TokenPrice(3.00, 15.00),
    "claude-opus-4-20250514": TokenPrice(15.00, 75.00),
    "claude-3-5-sonnet-20241022": TokenPrice(3.00, 15.00),
    "claude-3-5-haiku-20241022": TokenPrice(0.80, 4.00),
}


def estimate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> float:
    price = _lookup_price(model)
    if price is None:
        return 0.0
    return (input_tokens * price.input_per_m + output_tokens * price.output_per_m) / 1_000_000


def _lookup_price(model: str) -> Optional[TokenPrice]:
    if model in _PRICES:
        return _PRICES[model]
    lower = model.lower()
    if lower in _PRICES:
        return _PRICES[lower]
    for key, price in _PRICES.items():
        if lower == key.lower():
            return price
    best_key: Optional[str] = None
    best_len = 0
    for key in _PRICES:
        kl = key.lower()
        if lower.startswith(kl) and len(kl) > best_len:
            best_key = key
            best_len = len(kl)
    if best_key is not None:
        return _PRICES[best_key]
    return None


@dataclass
class CostEntry:
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float


@dataclass
class CostTracker:
    _entries: list[CostEntry] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)
    budget_usd: Optional[float] = None
    daily_budget_usd: Optional[float] = None
    alert_threshold_pct: float = 80.0

    def record(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
    ) -> CostEntry:
        cost = estimate_cost(model, input_tokens, output_tokens)
        entry = CostEntry(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
        )
        with self._lock:
            self._entries.append(entry)
        return entry

    @property
    def total_cost_usd(self) -> float:
        with self._lock:
            return sum(e.cost_usd for e in self._entries)

    @property
    def total_input_tokens(self) -> int:
        with self._lock:
            return sum(e.input_tokens for e in self._entries)

    @property
    def total_output_tokens(self) -> int:
        with self._lock:
            return sum(e.output_tokens for e in self._entries)

    @property
    def request_count(self) -> int:
        with self._lock:
            return len(self._entries)

    def is_over_budget(self) -> bool:
        if self.budget_usd is None:
            return False
        return self.total_cost_usd > self.budget_usd

    def is_over_daily_budget(self) -> bool:
        if self.daily_budget_usd is None:
            return False
        return self.total_cost_usd > self.daily_budget_usd

    def is_approaching_budget(self) -> bool:
        if self.budget_usd is None:
            return False
        pct = (self.total_cost_usd / self.budget_usd) * 100
        return pct >= self.alert_threshold_pct

    def budget_remaining_usd(self) -> Optional[float]:
        if self.budget_usd is None:
            return None
        return max(0.0, self.budget_usd - self.total_cost_usd)

    def cost_by_model(self) -> dict[str, float]:
        with self._lock:
            result: dict[str, float] = {}
            for e in self._entries:
                result[e.model] = result.get(e.model, 0.0) + e.cost_usd
            return result

    def summary(self) -> dict:
        return {
            "total_cost_usd": round(self.total_cost_usd, 6),
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "request_count": self.request_count,
            "budget_usd": self.budget_usd,
            "daily_budget_usd": self.daily_budget_usd,
            "over_budget": self.is_over_budget(),
            "over_daily_budget": self.is_over_daily_budget(),
            "approaching_budget": self.is_approaching_budget(),
            "budget_remaining_usd": self.budget_remaining_usd(),
            "cost_by_model": self.cost_by_model(),
        }

    def reset(self) -> None:
        with self._lock:
            self._entries.clear()
