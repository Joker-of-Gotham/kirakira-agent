"""Predict–calibrate style novelty and importance estimation."""

from __future__ import annotations

import math
from typing import Any

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


class PredictCalibrateScorer:
    """
    If existing memory embeddings can "predict" the new content (high max similarity),
    importance is down-weighted. Low similarity implies novelty -> high importance.
    """

    def __init__(self, embedder: Embedder, *, similarity_floor: float = 0.25) -> None:
        self.embedder = embedder
        self.similarity_floor = similarity_floor

    async def score(self, text: str, memory_vectors: list[list[float]]) -> float:
        if not text.strip():
            return 0.0
        (vec,) = await self.embedder.embed([text])
        if not memory_vectors:
            return 1.0
        best = max(_cosine(vec, ref) for ref in memory_vectors)
        novelty = max(0.0, min(1.0, 1.0 - best))
        calibrated = max(novelty, self.similarity_floor) if best == 0 else novelty
        return round(calibrated, 4)

    async def batch_scores(self, texts: list[str], memory_vectors: list[list[float]]) -> list[float]:
        if not texts:
            return []
        vectors = await self.embedder.embed(texts)
        scores: list[float] = []
        for vec in vectors:
            if not memory_vectors:
                scores.append(1.0)
                continue
            best = max(_cosine(vec, ref) for ref in memory_vectors)
            novelty = max(0.0, min(1.0, 1.0 - best))
            calibrated = max(novelty, self.similarity_floor) if best == 0 else novelty
            scores.append(round(calibrated, 4))
        return scores


async def predict_calibrate_from_payload(
    scorer: PredictCalibrateScorer,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Helper for workers/tests: expects `text` and optional `memory_vectors`."""
    text = str(payload.get("text") or "")
    raw_vecs = payload.get("memory_vectors") or []
    memory_vectors: list[list[float]] = []
    for row in raw_vecs:
        if isinstance(row, list):
            memory_vectors.append([float(x) for x in row])
    importance = await scorer.score(text, memory_vectors)
    return {"importance": importance, "text": text}
