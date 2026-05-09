"""Batching and pacing for embedding API calls."""

from __future__ import annotations

import asyncio
import time
from collections import deque
from collections.abc import Awaitable, Callable

from kirakira_memory_pipeline.embedding.embedder import Embedder


class EmbeddingBatchManager:
    """Collects texts, submits fixed-size batches, preserves output ordering."""

    def __init__(
        self,
        embedder: Embedder,
        *,
        batch_size: int = 64,
        max_requests_per_minute: int | None = 3000,
    ) -> None:
        if batch_size < 1:
            raise ValueError("batch_size must be positive")
        self.embedder = embedder
        self.batch_size = batch_size
        self.max_rpm = max_requests_per_minute
        self._timestamps: deque[float] = deque()

    async def _throttle(self) -> None:
        if self.max_rpm is None:
            return
        now = time.monotonic()
        window = 60.0
        while self._timestamps and now - self._timestamps[0] > window:
            self._timestamps.popleft()
        if len(self._timestamps) >= self.max_rpm:
            sleep_for = max(0.0, window - (now - self._timestamps[0]))
            if sleep_for > 0:
                await asyncio.sleep(sleep_for)
        self._timestamps.append(time.monotonic())

    async def embed_ordered(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        out: list[list[float]] = []
        for start in range(0, len(texts), self.batch_size):
            end = min(len(texts), start + self.batch_size)
            batch = texts[start:end]
            await self._throttle()
            vectors = await self.embedder.embed(batch)
            if len(vectors) != len(batch):
                raise RuntimeError(f"embedder returned {len(vectors)} vectors for batch; expected {len(batch)}")
            out.extend(vectors)
        return out

    async def map_async(
        self,
        texts: list[str],
        consumer: Callable[[list[str], list[list[float]]], Awaitable[None]],
    ) -> None:
        for start in range(0, len(texts), self.batch_size):
            end = min(len(texts), start + self.batch_size)
            batch = texts[start:end]
            await self._throttle()
            vectors = await self.embedder.embed(batch)
            await consumer(batch, vectors)
