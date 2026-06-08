"""Tests for MemoryPipelineConfig (Pydantic Settings)."""

from __future__ import annotations

from kirakira_memory_pipeline.config import MemoryPipelineConfig


def test_defaults():
    cfg = MemoryPipelineConfig()
    assert cfg.redis_url == "redis://localhost:6379/0"
    assert cfg.qdrant_port == 6333
    assert cfg.embedding_batch_size == 100
    assert cfg.consumer_group == "kirakira-memory-pipeline"
    assert cfg.batch_size == 10
    assert cfg.poll_timeout_ms == 5000


def test_stream_names():
    cfg = MemoryPipelineConfig()
    assert cfg.redis_stream_materialize == "kirakira:memory:materialize"
    assert cfg.redis_stream_forget == "kirakira:memory:forget"
    assert cfg.redis_stream_reflect == "kirakira:memory:reflect"


def test_stream_names_override_from_environment(monkeypatch):
    monkeypatch.setenv("KIRAKIRA_MEMORY_REDIS_STREAM_MATERIALIZE", "custom:materialize")
    cfg = MemoryPipelineConfig()
    assert cfg.redis_stream_materialize == "custom:materialize"


def test_legacy_strkirakira_environment_names_still_work(monkeypatch):
    monkeypatch.setenv("KIRAKIRA_MEMORY_REDIS_STRKIRAKIRA_MATERIALIZE", "legacy:materialize")
    cfg = MemoryPipelineConfig()
    assert cfg.redis_stream_materialize == "legacy:materialize"


def test_s3_defaults():
    cfg = MemoryPipelineConfig()
    assert cfg.s3_bucket == "kirakira-memory"
    assert cfg.s3_region == "us-east-1"
    assert cfg.s3_endpoint_url is None


def test_override_via_constructor():
    cfg = MemoryPipelineConfig(
        redis_url="redis://custom:6380/1",
        qdrant_host="qdrant.local",
        embedding_model="text-embedding-3-large",
        redis_stream_materialize="constructor:materialize",
    )
    assert cfg.redis_url == "redis://custom:6380/1"
    assert cfg.qdrant_host == "qdrant.local"
    assert cfg.embedding_model == "text-embedding-3-large"
    assert cfg.redis_stream_materialize == "constructor:materialize"
