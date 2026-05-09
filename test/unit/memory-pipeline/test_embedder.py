"""Tests for the Embedder ABC, StubEmbedder, EmbeddingBatchManager, and dimension config."""

from __future__ import annotations

import math

import pytest

from kirakira_memory_pipeline.embedding.embedder import Embedder
from kirakira_memory_pipeline.embedding.openai_embedder import _DIMS
from kirakira_memory_pipeline.embedding.batch_manager import EmbeddingBatchManager
from kirakira_memory_pipeline.embedding.bge_embedder import BGEM3Embedder

from _test_helpers import StubEmbedder


# ── StubEmbedder ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stub_embedder_returns_correct_dimensions():
    e = StubEmbedder(dim=16)
    vecs = await e.embed(["hello", "world"])
    assert len(vecs) == 2
    assert all(len(v) == 16 for v in vecs)


@pytest.mark.asyncio
async def test_stub_embedder_is_normalized():
    e = StubEmbedder(dim=8)
    [vec] = await e.embed(["test"])
    norm = math.sqrt(sum(x * x for x in vec))
    assert norm == pytest.approx(1.0, abs=1e-6)


@pytest.mark.asyncio
async def test_stub_embedder_deterministic():
    e = StubEmbedder(dim=8)
    v1 = await e.embed(["same text"])
    v2 = await e.embed(["same text"])
    assert v1 == v2


@pytest.mark.asyncio
async def test_stub_embedder_different_texts_differ():
    e = StubEmbedder(dim=8)
    v1, v2 = await e.embed(["alpha", "beta"])
    assert v1 != v2


@pytest.mark.asyncio
async def test_stub_embedder_empty_input():
    e = StubEmbedder(dim=4)
    assert await e.embed([]) == []


# ── OpenAI dimension mapping ──────────────────────────────────

def test_openai_dims_known_models():
    assert _DIMS["text-embedding-3-small"] == 1536
    assert _DIMS["text-embedding-3-large"] == 3072


# ── EmbeddingBatchManager ────────────────────────────────────

@pytest.mark.asyncio
async def test_batch_manager_splits_batches():
    e = StubEmbedder(dim=4)
    mgr = EmbeddingBatchManager(embedder=e, batch_size=2, max_requests_per_minute=None)
    texts = ["a", "b", "c", "d", "e"]
    vecs = await mgr.embed_ordered(texts)
    assert len(vecs) == 5
    assert all(len(v) == 4 for v in vecs)


@pytest.mark.asyncio
async def test_batch_manager_empty():
    e = StubEmbedder(dim=4)
    mgr = EmbeddingBatchManager(embedder=e, batch_size=10)
    assert await mgr.embed_ordered([]) == []


def test_batch_manager_rejects_zero_batch():
    e = StubEmbedder(dim=4)
    with pytest.raises(ValueError, match="batch_size"):
        EmbeddingBatchManager(embedder=e, batch_size=0)


@pytest.mark.asyncio
async def test_batch_manager_map_async():
    e = StubEmbedder(dim=4)
    mgr = EmbeddingBatchManager(embedder=e, batch_size=2, max_requests_per_minute=None)
    collected: list[tuple[list[str], list[list[float]]]] = []

    async def consumer(texts: list[str], vecs: list[list[float]]) -> None:
        collected.append((texts, vecs))

    await mgr.map_async(["a", "b", "c"], consumer)
    assert len(collected) == 2
    assert collected[0][0] == ["a", "b"]
    assert collected[1][0] == ["c"]


# ── BGEM3Embedder ─────────────────────────────────────────────

def test_bge_m3_dimension():
    from kirakira_memory_pipeline.config import MemoryPipelineConfig

    cfg = MemoryPipelineConfig(bge_dimension=768)
    b = BGEM3Embedder(config=cfg)
    assert b.dimension == 768


def test_bge_m3_default_dimension():
    b = BGEM3Embedder()
    assert b.dimension == 1024


@pytest.mark.asyncio
async def test_bge_m3_http_connection_error():
    """Without a running inference server, embed should raise a connection error."""
    from kirakira_memory_pipeline.config import MemoryPipelineConfig

    cfg = MemoryPipelineConfig(bge_mode="http", bge_http_url="http://127.0.0.1:19999/embed")
    b = BGEM3Embedder(config=cfg)
    with pytest.raises(Exception):
        await b.embed(["text"])


@pytest.mark.asyncio
async def test_bge_m3_empty_input():
    b = BGEM3Embedder()
    assert await b.embed([]) == []
