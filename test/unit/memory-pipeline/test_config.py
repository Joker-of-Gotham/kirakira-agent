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


def test_strkirakira_names():
    cfg = MemoryPipelineConfig()
    assert cfg.redis_strkirakira_materialize == "kirakira:memory:materialize"
    assert cfg.redis_strkirakira_forget == "kirakira:memory:forget"
    assert cfg.redis_strkirakira_reflect == "kirakira:memory:reflect"


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
    )
    assert cfg.redis_url == "redis://custom:6380/1"
    assert cfg.qdrant_host == "qdrant.local"
    assert cfg.embedding_model == "text-embedding-3-large"
