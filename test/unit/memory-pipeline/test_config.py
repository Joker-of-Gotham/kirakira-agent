"""Tests for MemoryPipelineConfig (Pydantic Settings)."""

from __future__ import annotations

import pytest

from kirakira_memory_pipeline.config import MemoryPipelineConfig


CONFIG_ENV_KEYS = [
    "DATABASE_URL",
    "REDIS_URL",
    "QDRANT_URL",
    "NEO4J_URI",
    "KIRAKIRA_NEO4J_USER",
    "KIRAKIRA_NEO4J_PASSWORD",
    "S3_ENDPOINT",
    "S3_ENDPOINT_URL",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "KIRAKIRA_MEMORY_POSTGRES_DSN",
    "KIRAKIRA_MEMORY_REDIS_URL",
    "KIRAKIRA_MEMORY_QDRANT_URL",
    "KIRAKIRA_MEMORY_QDRANT_HOST",
    "KIRAKIRA_MEMORY_QDRANT_PORT",
    "KIRAKIRA_MEMORY_NEO4J_URI",
    "KIRAKIRA_MEMORY_NEO4J_USER",
    "KIRAKIRA_MEMORY_NEO4J_PASSWORD",
    "KIRAKIRA_MEMORY_S3_ENDPOINT_URL",
    "KIRAKIRA_MEMORY_AWS_ACCESS_KEY_ID",
    "KIRAKIRA_MEMORY_AWS_SECRET_ACCESS_KEY",
]


@pytest.fixture(autouse=True)
def clear_config_environment(monkeypatch):
    for key in CONFIG_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)


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


def test_runtime_profile_environment_aliases(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://kirakira:secret@postgres:5432/kirakira")
    monkeypatch.setenv("REDIS_URL", "redis://redis:6379")
    monkeypatch.setenv("QDRANT_URL", "http://qdrant:6333")
    monkeypatch.setenv("NEO4J_URI", "bolt://neo4j:7687")
    monkeypatch.setenv("KIRAKIRA_NEO4J_USER", "neo4j-runtime")
    monkeypatch.setenv("KIRAKIRA_NEO4J_PASSWORD", "neo4j-secret")
    monkeypatch.setenv("S3_ENDPOINT", "http://minio:9000")
    monkeypatch.setenv("S3_ACCESS_KEY_ID", "minio-access")
    monkeypatch.setenv("S3_SECRET_ACCESS_KEY", "minio-secret")

    cfg = MemoryPipelineConfig()

    assert cfg.postgres_dsn == "postgres://kirakira:secret@postgres:5432/kirakira"
    assert cfg.redis_url == "redis://redis:6379"
    assert cfg.qdrant_url == "http://qdrant:6333"
    assert cfg.qdrant_host == "qdrant"
    assert cfg.qdrant_port == 6333
    assert cfg.neo4j_uri == "bolt://neo4j:7687"
    assert cfg.neo4j_user == "neo4j-runtime"
    assert cfg.neo4j_password == "neo4j-secret"
    assert cfg.s3_endpoint_url == "http://minio:9000"
    assert cfg.aws_access_key_id == "minio-access"
    assert cfg.aws_secret_access_key == "minio-secret"


def test_memory_specific_environment_takes_precedence(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://runtime")
    monkeypatch.setenv("KIRAKIRA_MEMORY_POSTGRES_DSN", "postgres://memory")
    monkeypatch.setenv("REDIS_URL", "redis://runtime")
    monkeypatch.setenv("KIRAKIRA_MEMORY_REDIS_URL", "redis://memory")
    monkeypatch.setenv("QDRANT_URL", "http://runtime-qdrant:6333")
    monkeypatch.setenv("KIRAKIRA_MEMORY_QDRANT_URL", "http://memory-qdrant:7333")

    cfg = MemoryPipelineConfig()

    assert cfg.postgres_dsn == "postgres://memory"
    assert cfg.redis_url == "redis://memory"
    assert cfg.qdrant_url == "http://memory-qdrant:7333"
    assert cfg.qdrant_host == "memory-qdrant"
    assert cfg.qdrant_port == 7333


def test_explicit_qdrant_host_port_override_qdrant_url(monkeypatch):
    monkeypatch.setenv("QDRANT_URL", "http://runtime-qdrant:6333")

    cfg = MemoryPipelineConfig(qdrant_host="qdrant.local", qdrant_port=7333)

    assert cfg.qdrant_url == "http://runtime-qdrant:6333"
    assert cfg.qdrant_host == "qdrant.local"
    assert cfg.qdrant_port == 7333


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
