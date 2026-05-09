"""Tests for GraphMaterializer static helpers (no Neo4j connection)."""

from __future__ import annotations

from kirakira_memory_pipeline.materializer.graph_materializer import _clean_label


def test_clean_label_strips_special_chars():
    assert _clean_label("My-Label!") == "MyLabel"


def test_clean_label_preserves_underscores():
    assert _clean_label("my_label") == "my_label"


def test_clean_label_falls_back_to_entity():
    assert _clean_label("!!!") == "Entity"


def test_clean_label_alphanumeric():
    assert _clean_label("Label123") == "Label123"


def test_clean_label_empty_string():
    assert _clean_label("") == "Entity"


def test_clean_label_unicode_kept_if_alnum():
    result = _clean_label("标签Test")
    assert "Test" in result
