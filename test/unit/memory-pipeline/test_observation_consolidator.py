"""Tests for ObservationConsolidator normalization logic (no LLM calls)."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.extraction.fact_extractor import Fact
from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.reflect.observation_consolidator import ObservationConsolidator, Observation


@pytest.fixture
def consolidator() -> ObservationConsolidator:
    cfg = MemoryPipelineConfig(llm_api_key="sk-test-fake-key")
    return ObservationConsolidator(config=cfg)


def test_normalize_facts_from_fact_objects(consolidator: ObservationConsolidator):
    facts = [
        Fact(subject="A", predicate="is", object="B"),
        Fact(subject="C", predicate="has", object="D"),
    ]
    result = consolidator._normalize_facts(facts)
    assert len(result) == 2
    assert result[0].subject == "A"


def test_normalize_facts_from_dicts(consolidator: ObservationConsolidator):
    raw = [
        {"subject": "X", "predicate": "uses", "object": "Y"},
        {"subject": "A", "predicate": "runs", "object": "B", "confidence": 0.8},
    ]
    result = consolidator._normalize_facts(raw)
    assert len(result) == 2
    assert result[1].confidence == 0.8


def test_normalize_facts_with_obj_alias(consolidator: ObservationConsolidator):
    raw = [{"subject": "X", "predicate": "Y", "obj": "Z"}]
    result = consolidator._normalize_facts(raw)
    assert len(result) == 1
    assert result[0].object == "Z"


def test_normalize_facts_skips_invalid(consolidator: ObservationConsolidator):
    raw = [
        {"subject": "A", "predicate": "B", "object": "C"},
        {"bad": "data"},
        {"subject": "", "predicate": "x", "object": "y"},
    ]
    result = consolidator._normalize_facts(raw)
    assert len(result) == 1


def test_normalize_facts_empty_list(consolidator: ObservationConsolidator):
    assert consolidator._normalize_facts([]) == []


def test_normalize_facts_non_list(consolidator: ObservationConsolidator):
    assert consolidator._normalize_facts("not a list") == []


def test_facts_from_payload_checks_keys(consolidator: ObservationConsolidator):
    payload = {"items": [{"subject": "A", "predicate": "B", "object": "C"}]}
    result = consolidator._facts_from_payload(payload)
    assert len(result) == 1

    payload2 = {"records": [{"subject": "X", "predicate": "Y", "object": "Z"}]}
    result2 = consolidator._facts_from_payload(payload2)
    assert len(result2) == 1

    assert consolidator._facts_from_payload({}) == []


def test_observation_model():
    obs = Observation(
        summary="Test observation",
        entity_ids=["e1", "e2"],
        supporting_facts=["fact line 1"],
    )
    assert obs.summary == "Test observation"
    assert len(obs.entity_ids) == 2
