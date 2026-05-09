"""Tests for ImportancePredictor (n-gram information gain heuristic)."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.scoring.importance_predictor import ImportancePredictor


@pytest.fixture
def predictor() -> ImportancePredictor:
    return ImportancePredictor(ngram_range=(1, 3))


def test_predict_gain_empty_new_text(predictor: ImportancePredictor):
    assert predictor.predict_gain("", ["some existing text"]) == 0.0


def test_predict_gain_empty_corpus(predictor: ImportancePredictor):
    score = predictor.predict_gain("completely new information here", [])
    assert 0.0 <= score <= 1.0
    assert score > 0.5


def test_predict_gain_duplicate(predictor: ImportancePredictor):
    text = "the cat sat on the mat"
    score = predictor.predict_gain(text, [text])
    assert score < 0.5


def test_predict_gain_novel_content(predictor: ImportancePredictor):
    corpus = ["Python is a programming language"]
    novel = "Quantum computing uses qubits and superposition"
    score = predictor.predict_gain(novel, corpus)
    assert score > 0.4


def test_predict_gain_bounded(predictor: ImportancePredictor):
    for _ in range(10):
        score = predictor.predict_gain("random new text here", ["old text there"])
        assert 0.0 <= score <= 1.0


def test_tokens_lowercases():
    tokens = ImportancePredictor._tokens("Hello WORLD 123!")
    assert "hello" in tokens
    assert "world" in tokens
    assert "123" in tokens


def test_ngrams_unigram():
    p = ImportancePredictor(ngram_range=(1, 1))
    counts = p._ngrams(["a", "b", "c"])
    assert counts["a"] == 1
    assert counts["b"] == 1


def test_ngrams_bigram():
    p = ImportancePredictor(ngram_range=(2, 2))
    counts = p._ngrams(["a", "b", "c"])
    assert counts["a b"] == 1
    assert counts["b c"] == 1
    assert len(counts) == 2
