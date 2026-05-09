"""Runtime configuration for the memory pipeline."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class MemoryPipelineConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KIRAKIRA_MEMORY_", extra="ignore")

    postgres_dsn: str = "postgresql://localhost:5432/kirakira"
    redis_url: str = "redis://localhost:6379/0"
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "password"

    embedding_model: str = "text-embedding-3-small"
    embedding_api_key: str = ""
    embedding_batch_size: int = 100

    bge_mode: str = "http"
    bge_model_name: str = "BAAI/bge-m3"
    bge_http_url: str = "http://localhost:8080/embed"
    bge_dimension: int = 1024
    bge_max_length: int = 8192

    retain_reflect_threshold: float = 0.72
    fact_base_confidence: float = 0.65
    fact_confidence_step: float = 0.05
    belief_default_confidence: float = 0.7
    belief_support_delta: float = 0.12
    belief_contradict_delta: float = 0.18

    consumer_group: str = "kirakira-memory-pipeline"
    consumer_name: str = "worker-1"
    poll_timeout_ms: int = 5000
    batch_size: int = 10

    redis_strkirakira_materialize: str = "kirakira:memory:materialize"
    redis_strkirakira_forget: str = "kirakira:memory:forget"
    redis_strkirakira_reflect: str = "kirakira:memory:reflect"

    qdrant_collection: str = "kirakira_memory"
    s3_endpoint_url: str | None = None
    s3_bucket: str = "kirakira-memory"
    s3_region: str = "us-east-1"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None

    llm_model: str = "gpt-4o-mini"
    llm_api_key: str | None = None
