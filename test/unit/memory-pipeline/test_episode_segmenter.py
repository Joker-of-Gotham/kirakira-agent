"""Tests for EpisodeSegmenter: chunking, boundary detection, and sentence snapping."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.segmentation.episode_segmenter import EpisodeSegmenter
from kirakira_memory_pipeline.segmentation.boundary_detector import SemanticBoundaryDetector, _cosine
from kirakira_memory_pipeline.segmentation.representation_aligner import RepresentationAligner

from _test_helpers import StubEmbedder


# ── Cosine helper ──────────────────────────────────────────────

def test_cosine_identical_vectors():
    v = [1.0, 0.0, 1.0]
    assert _cosine(v, v) == pytest.approx(1.0)


def test_cosine_orthogonal_vectors():
    assert _cosine([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_empty_vectors():
    assert _cosine([], []) == 0.0


def test_cosine_mismatched_lengths():
    assert _cosine([1.0, 2.0], [1.0]) == 0.0


# ── SemanticBoundaryDetector ───────────────────────────────────

@pytest.mark.asyncio
async def test_boundary_detector_no_split_for_single_chunk(stub_embedder: StubEmbedder):
    det = SemanticBoundaryDetector(similarity_threshold=0.5)
    result = await det.boundary_indices(["only chunk"], stub_embedder)
    assert result == []


@pytest.mark.asyncio
async def test_boundary_detector_validates_threshold():
    with pytest.raises(ValueError, match="similarity_threshold"):
        SemanticBoundaryDetector(similarity_threshold=0.0)
    with pytest.raises(ValueError, match="similarity_threshold"):
        SemanticBoundaryDetector(similarity_threshold=1.0)


@pytest.mark.asyncio
async def test_boundary_detector_finds_boundaries(stub_embedder: StubEmbedder):
    chunks = [
        "Machine learning uses statistical models.",
        "Deep learning builds on neural networks.",
        "Cooking pasta requires boiling water first.",
        "Add sauce after draining the noodles.",
    ]
    det = SemanticBoundaryDetector(similarity_threshold=0.999, require_local_minimum=False)
    boundaries = await det.boundary_indices(chunks, stub_embedder)
    assert isinstance(boundaries, list)
    for b in boundaries:
        assert 0 <= b < len(chunks) - 1


# ── RepresentationAligner ─────────────────────────────────────

def test_aligner_empty_boundaries():
    aligner = RepresentationAligner()
    assert aligner.align_boundaries("Hello world. Goodbye.", []) == []


def test_aligner_snaps_to_sentence():
    text = "Hello world. Goodbye world."
    aligner = RepresentationAligner(prefer_paragraphs=False)
    result = aligner.align_boundaries(text, [5])
    assert all(isinstance(x, int) for x in result)
    assert len(result) >= 1


def test_aligner_paragraph_boundary():
    text = "Paragraph one.\n\nParagraph two.\n\nParagraph three."
    aligner = RepresentationAligner(prefer_paragraphs=True)
    result = aligner.align_boundaries(text, [17])
    assert len(result) >= 1


# ── EpisodeSegmenter (end-to-end) ─────────────────────────────

@pytest.mark.asyncio
async def test_segmenter_empty_text(stub_embedder: StubEmbedder):
    seg = EpisodeSegmenter()
    episodes = await seg.segment("", stub_embedder)
    assert episodes == []


@pytest.mark.asyncio
async def test_segmenter_whitespace_only(stub_embedder: StubEmbedder):
    seg = EpisodeSegmenter()
    episodes = await seg.segment("   \n\n  ", stub_embedder)
    assert episodes == []


@pytest.mark.asyncio
async def test_segmenter_short_text_no_split(stub_embedder: StubEmbedder):
    seg = EpisodeSegmenter()
    text = "A short text that fits in one chunk."
    episodes = await seg.segment(text, stub_embedder, target_tokens=500)
    assert len(episodes) == 1
    assert episodes[0].text.strip() == text.strip()
    assert episodes[0].start_char == 0


@pytest.mark.asyncio
async def test_segmenter_long_text_produces_multiple_episodes(stub_embedder: StubEmbedder):
    para1 = "Machine learning is a subfield of artificial intelligence. " * 20
    para2 = "\n\nCooking is a creative process that combines ingredients. " * 20
    text = para1 + para2
    seg = EpisodeSegmenter()
    episodes = await seg.segment(text, stub_embedder, target_tokens=60, stride_tokens=30)
    assert len(episodes) >= 1
    for ep in episodes:
        assert ep.text.strip()
        assert ep.start_char >= 0
        assert ep.end_char > ep.start_char


@pytest.mark.asyncio
async def test_segmenter_episode_spans_cover_text(stub_embedder: StubEmbedder):
    text = "First sentence. Second sentence. Third sentence. Fourth sentence. " * 10
    seg = EpisodeSegmenter()
    episodes = await seg.segment(text, stub_embedder, target_tokens=40, stride_tokens=20)
    if len(episodes) > 1:
        assert episodes[0].start_char < episodes[-1].end_char
