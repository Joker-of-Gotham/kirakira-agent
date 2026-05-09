"""Tests for EntityExtractor normalization and deduplication logic."""

from __future__ import annotations

from kirakira_memory_pipeline.extraction.entity_extractor import EntityExtractor, ExtractedEntity


def test_normalize_key_casefolds_and_strips():
    assert EntityExtractor._normalize_key("  Alice Smith  ", "PERSON") == "person::alice smith"


def test_normalize_key_collapses_whitespace():
    assert EntityExtractor._normalize_key("United  States   of America", "GPE") == "gpe::united states of america"


def test_merge_mentions_deduplicates():
    result = EntityExtractor._merge_mentions(["Alice", "alice", "ALICE"], ["Bob", "alice"])
    lower_set = {m.lower() for m in result}
    assert "alice" in lower_set
    assert "bob" in lower_set
    assert len(result) == 2


def test_merge_mentions_skips_empty():
    result = EntityExtractor._merge_mentions(["", "  ", "valid"])
    assert result == ["valid"]


def test_merge_mentions_preserves_order():
    result = EntityExtractor._merge_mentions(["Zara", "Alice"], ["Bob"])
    assert result[0] == "Zara"
    assert result[1] == "Alice"
    assert result[2] == "Bob"


def test_extracted_entity_model():
    ent = ExtractedEntity(
        text="Apple Inc.",
        entity_type="ORG",
        canonical_form="Apple Inc.",
        mentions=["Apple", "apple inc"],
    )
    assert ent.entity_type == "ORG"
    assert len(ent.mentions) == 2
