"""Tests for VectorMaterializer static helpers (no Qdrant connection)."""

from __future__ import annotations

from kirakira_memory_pipeline.materializer.vector_materializer import VectorMaterializer


def test_point_id_int_passthrough():
    assert VectorMaterializer._point_id(42) == 42


def test_point_id_digit_string_to_int():
    assert VectorMaterializer._point_id("123") == 123


def test_point_id_uuid_string_passthrough():
    uid = "abc-def-123"
    assert VectorMaterializer._point_id(uid) == uid
