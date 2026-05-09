"""Tests for BeliefUpdater, BeliefCandidateGenerator, and _fact_conflicts."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.extraction.fact_extractor import Fact
from kirakira_memory_pipeline.extraction.belief_candidate import BeliefCandidate, BeliefCandidateGenerator
from kirakira_memory_pipeline.reflect.belief_updater import (
    BeliefState,
    BeliefUpdater,
    _fact_conflicts,
    _extract_facts,
)


# ── _fact_conflicts ────────────────────────────────────────────

def test_fact_conflicts_same_subject_predicate_different_object():
    a = Fact(subject="Python", predicate="is", object="fast")
    b = Fact(subject="Python", predicate="is", object="slow")
    assert _fact_conflicts(a, b) is True


def test_fact_conflicts_same_everything():
    a = Fact(subject="Python", predicate="is", object="fast")
    b = Fact(subject="Python", predicate="is", object="fast")
    assert _fact_conflicts(a, b) is False


def test_fact_conflicts_different_subject():
    a = Fact(subject="Python", predicate="is", object="fast")
    b = Fact(subject="Rust", predicate="is", object="slow")
    assert _fact_conflicts(a, b) is False


def test_fact_conflicts_different_predicate():
    a = Fact(subject="Python", predicate="is", object="fast")
    b = Fact(subject="Python", predicate="supports", object="slow")
    assert _fact_conflicts(a, b) is False


def test_fact_conflicts_case_insensitive():
    a = Fact(subject="PYTHON", predicate="IS", object="fast")
    b = Fact(subject="python", predicate="is", object="SLOW")
    assert _fact_conflicts(a, b) is True


# ── _extract_facts ─────────────────────────────────────────────

def test_extract_facts_from_payload():
    payload = {"facts": [{"subject": "A", "predicate": "B", "object": "C"}]}
    facts = _extract_facts(payload)
    assert len(facts) == 1
    assert facts[0].subject == "A"


def test_extract_facts_empty_payload():
    assert _extract_facts({}) == []


def test_extract_facts_with_fact_objects():
    f = Fact(subject="X", predicate="Y", object="Z")
    facts = _extract_facts({"facts": [f]})
    assert len(facts) == 1


# ── BeliefCandidateGenerator ──────────────────────────────────

def test_generator_no_candidates_for_unique_subjects():
    gen = BeliefCandidateGenerator()
    facts = [
        Fact(subject="A", predicate="is", object="x"),
        Fact(subject="B", predicate="is", object="y"),
    ]
    assert gen.propose(facts) == []


def test_generator_groups_by_subject():
    gen = BeliefCandidateGenerator()
    facts = [
        Fact(subject="Python", predicate="is", object="language", confidence=0.9),
        Fact(subject="Python", predicate="supports", object="typing", confidence=0.8),
        Fact(subject="Python", predicate="has", object="GIL", confidence=0.7),
    ]
    candidates = gen.propose(facts)
    assert len(candidates) == 1
    assert candidates[0].belief.startswith("Regarding Python")
    assert len(candidates[0].support_facts) == 3


def test_generator_confidence_boosted_by_diversity():
    gen = BeliefCandidateGenerator()
    facts = [
        Fact(subject="X", predicate="a", object="1", confidence=0.5),
        Fact(subject="X", predicate="b", object="2", confidence=0.5),
        Fact(subject="X", predicate="c", object="3", confidence=0.5),
    ]
    candidates = gen.propose(facts)
    assert candidates[0].confidence > 0.5


def test_generator_empty_input():
    gen = BeliefCandidateGenerator()
    assert gen.propose([]) == []


# ── BeliefState model ─────────────────────────────────────────

def test_belief_state_defaults():
    b = BeliefState(belief_text="test belief")
    assert b.confidence == 0.5
    assert b.supporting_ids == []
    assert b.contradicting_ids == []


# ── BeliefUpdater ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_updater_from_evidence_basic():
    updater = BeliefUpdater()
    payload = {
        "facts": [
            {"subject": "Python", "predicate": "is", "object": "popular", "confidence": 0.9},
            {"subject": "Python", "predicate": "supports", "object": "async", "confidence": 0.85},
        ]
    }
    revisions = await updater.update_from_evidence(payload)
    assert len(revisions) == 1
    assert revisions[0].belief.confidence > 0
    assert revisions[0].belief.confidence <= 1.0


@pytest.mark.asyncio
async def test_updater_with_refuting_facts():
    updater = BeliefUpdater()
    payload = {
        "facts": [
            {"subject": "Python", "predicate": "is", "object": "fast", "confidence": 0.8},
            {"subject": "Python", "predicate": "supports", "object": "types", "confidence": 0.7},
        ],
        "refuting_facts": [
            {"subject": "Python", "predicate": "is", "object": "slow", "confidence": 0.9},
        ],
    }
    revisions = await updater.update_from_evidence(payload)
    assert len(revisions) == 1
    assert revisions[0].notes == "adjusted for refuting evidence"
    assert len(revisions[0].belief.contradicting_ids) > 0


@pytest.mark.asyncio
async def test_updater_empty_facts():
    updater = BeliefUpdater()
    revisions = await updater.update_from_evidence({"facts": []})
    assert revisions == []


@pytest.mark.asyncio
async def test_updater_support_score_static():
    facts = [
        Fact(subject="A", predicate="B", object="C", confidence=0.8),
        Fact(subject="D", predicate="E", object="F", confidence=0.6),
    ]
    score = BeliefUpdater._support_score(facts)
    assert score == pytest.approx(0.7, abs=0.01)

    assert BeliefUpdater._support_score([]) == 0.0
