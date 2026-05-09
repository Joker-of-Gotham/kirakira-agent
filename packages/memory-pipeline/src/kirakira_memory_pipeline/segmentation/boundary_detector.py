"""Sliding-window semantic boundary detection via embedding similarity."""

from __future__ import annotations

import math

from kirakira_memory_pipeline.embedding.embedder import Embedder


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _approx_tokens(text: str) -> int:
    return max(1, len(text.split()))


class SemanticBoundaryDetector:
    """Compares consecutive chunk embeddings; low similarity implies a boundary.

    Boundaries are suppressed when the resulting segments would be shorter than
    ``min_chunk_tokens`` or longer than ``max_chunk_tokens`` (measured in
    approximate whitespace-split word count as a proxy for token count).
    """

    def __init__(
        self,
        *,
        similarity_threshold: float = 0.55,
        min_chunk_tokens: int = 64,
        max_chunk_tokens: int = 256,
        require_local_minimum: bool = True,
    ) -> None:
        if not 0.0 < similarity_threshold < 1.0:
            raise ValueError("similarity_threshold must be in (0,1)")
        self.similarity_threshold = similarity_threshold
        self.min_chunk_tokens = min_chunk_tokens
        self.max_chunk_tokens = max_chunk_tokens
        self.require_local_minimum = require_local_minimum

    async def boundary_indices(self, chunk_texts: list[str], embedder: Embedder) -> list[int]:
        if len(chunk_texts) < 2:
            return []
        embeddings = await embedder.embed(chunk_texts)
        if len(embeddings) != len(chunk_texts):
            raise RuntimeError("embedder returned unexpected embedding count")

        sims: list[float] = []
        for i in range(len(embeddings) - 1):
            sims.append(_cosine(embeddings[i], embeddings[i + 1]))

        candidates: list[int] = []
        for i, sim in enumerate(sims):
            if sim >= self.similarity_threshold:
                continue
            if self.require_local_minimum and len(sims) > 1:
                left = sims[i - 1] if i > 0 else 1.0
                right = sims[i + 1] if i + 1 < len(sims) else 1.0
                if not (sim <= left and sim <= right):
                    continue
            candidates.append(i)

        if not candidates:
            return []

        boundaries: list[int] = []
        prev_end = 0
        for idx in candidates:
            left_span = chunk_texts[prev_end : idx + 1]
            right_start = idx + 1
            next_boundary = candidates[candidates.index(idx) + 1] + 1 if idx != candidates[-1] else len(chunk_texts)
            right_span = chunk_texts[right_start:next_boundary]

            left_tokens = sum(_approx_tokens(t) for t in left_span)
            right_tokens = sum(_approx_tokens(t) for t in right_span)

            if left_tokens < self.min_chunk_tokens or right_tokens < self.min_chunk_tokens:
                continue
            boundaries.append(idx)
            prev_end = idx + 1

        return boundaries
