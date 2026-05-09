"""Shared fixtures for memory-pipeline unit tests."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.embedding.embedder import Embedder
from kirakira_memory_pipeline.extraction.fact_extractor import Fact


class StubEmbedder(Embedder):
    """Returns deterministic vectors based on text hash for reproducible tests."""

    def __init__(self, dim: int = 8) -> None:
        self._dim = dim

    @property
    def dimension(self) -> int:
        return self._dim

    async def embed(self, texts: list[str]) -> list[list[float]]:
        vecs: list[list[float]] = []
        for t in texts:
            h = hash(t) & 0xFFFFFFFF
            vec = [((h >> (i * 4)) & 0xF) / 15.0 for i in range(self._dim)]
            norm = max(sum(x * x for x in vec) ** 0.5, 1e-9)
            vecs.append([x / norm for x in vec])
        return vecs


@pytest.fixture
def stub_embedder() -> StubEmbedder:
    return StubEmbedder(dim=8)


@pytest.fixture
def sample_facts() -> list[Fact]:
    return [
        Fact(subject="Python", predicate="is", object="a programming language", confidence=0.95),
        Fact(subject="Python", predicate="supports", object="dynamic typing", confidence=0.9),
        Fact(subject="Rust", predicate="is", object="memory safe", confidence=0.88),
    ]
