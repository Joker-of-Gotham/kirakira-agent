"""Tests for PredictCalibrateScorer and predict_calibrate_from_payload."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.reflect.predict_calibrate import (
    PredictCalibrateScorer,
    _cosine,
    predict_calibrate_from_payload,
)

from _test_helpers import StubEmbedder


# ── Cosine helper ──────────────────────────────────────────────

def test_cosine_parallel():
    assert _cosine([1, 0, 0], [1, 0, 0]) == pytest.approx(1.0)


def test_cosine_antiparallel():
    assert _cosine([1, 0], [-1, 0]) == pytest.approx(-1.0)


def test_cosine_empty():
    assert _cosine([], []) == 0.0


def test_cosine_zero_vector():
    assert _cosine([0, 0], [1, 1]) == 0.0


# ── PredictCalibrateScorer ─────────────────────────────────────

@pytest.mark.asyncio
async def test_score_empty_text():
    e = StubEmbedder(dim=4)
    pc = PredictCalibrateScorer(e)
    assert await pc.score("", []) == 0.0
    assert await pc.score("   ", []) == 0.0


@pytest.mark.asyncio
async def test_score_no_memory_returns_max():
    e = StubEmbedder(dim=4)
    pc = PredictCalibrateScorer(e)
    score = await pc.score("brand new information", [])
    assert score == 1.0


@pytest.mark.asyncio
async def test_score_identical_memory_low_novelty():
    e = StubEmbedder(dim=8)
    pc = PredictCalibrateScorer(e)
    [ref] = await e.embed(["existing info"])
    score = await pc.score("existing info", [ref])
    assert score == pytest.approx(0.0, abs=0.01)


@pytest.mark.asyncio
async def test_score_bounded():
    e = StubEmbedder(dim=8)
    pc = PredictCalibrateScorer(e)
    [ref] = await e.embed(["old memory"])
    score = await pc.score("something new entirely", [ref])
    assert 0.0 <= score <= 1.0


@pytest.mark.asyncio
async def test_batch_scores_empty():
    e = StubEmbedder(dim=4)
    pc = PredictCalibrateScorer(e)
    assert await pc.batch_scores([], []) == []


@pytest.mark.asyncio
async def test_batch_scores_no_memory():
    e = StubEmbedder(dim=4)
    pc = PredictCalibrateScorer(e)
    scores = await pc.batch_scores(["a", "b"], [])
    assert scores == [1.0, 1.0]


@pytest.mark.asyncio
async def test_batch_scores_consistent_with_single():
    e = StubEmbedder(dim=8)
    pc = PredictCalibrateScorer(e)
    [ref] = await e.embed(["reference"])
    batch = await pc.batch_scores(["reference", "new stuff"], [ref])
    single_ref = await pc.score("reference", [ref])
    single_new = await pc.score("new stuff", [ref])
    assert batch[0] == pytest.approx(single_ref, abs=0.001)
    assert batch[1] == pytest.approx(single_new, abs=0.001)


# ── predict_calibrate_from_payload ─────────────────────────────

@pytest.mark.asyncio
async def test_payload_helper():
    e = StubEmbedder(dim=4)
    pc = PredictCalibrateScorer(e)
    result = await predict_calibrate_from_payload(pc, {"text": "hello world"})
    assert "importance" in result
    assert result["text"] == "hello world"
    assert 0.0 <= result["importance"] <= 1.0


@pytest.mark.asyncio
async def test_payload_helper_with_vectors():
    e = StubEmbedder(dim=4)
    pc = PredictCalibrateScorer(e)
    vecs = await e.embed(["existing"])
    result = await predict_calibrate_from_payload(
        pc,
        {"text": "test", "memory_vectors": [list(v) for v in vecs]},
    )
    assert 0.0 <= result["importance"] <= 1.0
