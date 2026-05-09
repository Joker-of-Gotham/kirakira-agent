"""Tests for Fact model validation and FactsWrapper."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from kirakira_memory_pipeline.extraction.fact_extractor import Fact, FactsWrapper


def test_fact_valid():
    f = Fact(subject="Python", predicate="is", object="language")
    assert f.confidence == 1.0
    assert f.subject == "Python"


def test_fact_custom_confidence():
    f = Fact(subject="X", predicate="Y", object="Z", confidence=0.5)
    assert f.confidence == 0.5


def test_fact_rejects_empty_subject():
    with pytest.raises(ValidationError):
        Fact(subject="", predicate="is", object="x")


def test_fact_rejects_empty_predicate():
    with pytest.raises(ValidationError):
        Fact(subject="x", predicate="", object="y")


def test_fact_rejects_empty_object():
    with pytest.raises(ValidationError):
        Fact(subject="x", predicate="y", object="")


def test_fact_rejects_confidence_below_zero():
    with pytest.raises(ValidationError):
        Fact(subject="a", predicate="b", object="c", confidence=-0.1)


def test_fact_rejects_confidence_above_one():
    with pytest.raises(ValidationError):
        Fact(subject="a", predicate="b", object="c", confidence=1.1)


def test_facts_wrapper_empty():
    w = FactsWrapper(facts=[])
    assert w.facts == []


def test_facts_wrapper_with_facts():
    f1 = Fact(subject="A", predicate="B", object="C")
    f2 = Fact(subject="D", predicate="E", object="F", confidence=0.3)
    w = FactsWrapper(facts=[f1, f2])
    assert len(w.facts) == 2
    assert w.facts[1].confidence == 0.3
