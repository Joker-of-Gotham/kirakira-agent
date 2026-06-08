"""Tests for MemoryPipelineWorker event decoding and handler routing."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.worker import MemoryPipelineWorker, _decode_event


# ── _decode_event ──────────────────────────────────────────────

def test_decode_event_bytes_keys_and_values():
    raw = {b"op": b"vector", b"payload": b'{"points": []}'}
    out = _decode_event(raw)
    assert out["op"] == "vector"
    assert out["payload"] == '{"points": []}'


def test_decode_event_string_keys():
    raw = {"op": "graph", "count": "5"}
    out = _decode_event(raw)
    assert out["op"] == "graph"


def test_decode_event_non_utf8_bytes():
    raw = {b"data": b"\xff\xfe"}
    out = _decode_event(raw)
    assert isinstance(out["data"], bytes)


# ── Handler routing ────────────────────────────────────────────

def test_handler_for_materialize_stream():
    cfg = MemoryPipelineConfig()
    worker = MemoryPipelineWorker.__new__(MemoryPipelineWorker)
    worker.config = cfg
    handler = worker._handler_for_stream(cfg.redis_stream_materialize)
    assert handler.__name__ == "_handle_materialize"


def test_handler_for_forget_stream():
    cfg = MemoryPipelineConfig()
    worker = MemoryPipelineWorker.__new__(MemoryPipelineWorker)
    worker.config = cfg
    handler = worker._handler_for_stream(cfg.redis_stream_forget)
    assert handler.__name__ == "_handle_forget"


def test_handler_for_reflect_stream():
    cfg = MemoryPipelineConfig()
    worker = MemoryPipelineWorker.__new__(MemoryPipelineWorker)
    worker.config = cfg
    handler = worker._handler_for_stream(cfg.redis_stream_reflect)
    assert handler.__name__ == "_handle_reflect"


def test_handler_unknown_stream_raises():
    cfg = MemoryPipelineConfig()
    worker = MemoryPipelineWorker.__new__(MemoryPipelineWorker)
    worker.config = cfg
    with pytest.raises(ValueError, match="unrecognized stream"):
        worker._handler_for_stream("nonexistent:stream")


def test_stream_names():
    cfg = MemoryPipelineConfig()
    worker = MemoryPipelineWorker.__new__(MemoryPipelineWorker)
    worker.config = cfg
    names = worker._stream_names()
    assert len(names) == 3
    assert cfg.redis_stream_materialize in names
    assert cfg.redis_stream_forget in names
    assert cfg.redis_stream_reflect in names


def test_stream_handler_registry():
    cfg = MemoryPipelineConfig()
    worker = MemoryPipelineWorker.__new__(MemoryPipelineWorker)
    worker.config = cfg

    handlers = worker._stream_handlers()

    assert handlers[cfg.redis_stream_materialize].__name__ == "_handle_materialize"
    assert handlers[cfg.redis_stream_forget].__name__ == "_handle_forget"
    assert handlers[cfg.redis_stream_reflect].__name__ == "_handle_reflect"
