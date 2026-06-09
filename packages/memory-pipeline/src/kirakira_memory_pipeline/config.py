"""Runtime configuration for the memory pipeline."""

from __future__ import annotations

from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class MemoryPipelineConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KIRAKIRA_MEMORY_", extra="ignore", populate_by_name=True)

    postgres_dsn: str = Field(
        "postgresql://localhost:5432/kirakira",
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_POSTGRES_DSN", "DATABASE_URL"),
    )
    redis_url: str = Field(
        "redis://localhost:6379/0",
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_REDIS_URL", "REDIS_URL"),
    )
    qdrant_url: str | None = Field(
        None,
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_QDRANT_URL", "QDRANT_URL"),
    )
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    neo4j_uri: str = Field(
        "bolt://localhost:7687",
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_NEO4J_URI", "NEO4J_URI"),
    )
    neo4j_user: str = Field(
        "neo4j",
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_NEO4J_USER", "KIRAKIRA_NEO4J_USER"),
    )
    neo4j_password: str = Field(
        "password",
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_NEO4J_PASSWORD", "KIRAKIRA_NEO4J_PASSWORD"),
    )

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

    redis_stream_materialize: str = Field(
        "kirakira:memory:materialize",
        validation_alias=AliasChoices(
            "KIRAKIRA_MEMORY_REDIS_STREAM_MATERIALIZE",
            "KIRAKIRA_MEMORY_REDIS_STRKIRAKIRA_MATERIALIZE",
        ),
    )
    redis_stream_forget: str = Field(
        "kirakira:memory:forget",
        validation_alias=AliasChoices(
            "KIRAKIRA_MEMORY_REDIS_STREAM_FORGET",
            "KIRAKIRA_MEMORY_REDIS_STRKIRAKIRA_FORGET",
        ),
    )
    redis_stream_reflect: str = Field(
        "kirakira:memory:reflect",
        validation_alias=AliasChoices(
            "KIRAKIRA_MEMORY_REDIS_STREAM_REFLECT",
            "KIRAKIRA_MEMORY_REDIS_STRKIRAKIRA_REFLECT",
        ),
    )

    qdrant_collection: str = "kirakira_memory"
    s3_endpoint_url: str | None = Field(
        None,
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_S3_ENDPOINT_URL", "S3_ENDPOINT", "S3_ENDPOINT_URL"),
    )
    s3_bucket: str = "kirakira-memory"
    s3_region: str = "us-east-1"
    aws_access_key_id: str | None = Field(
        None,
        validation_alias=AliasChoices("KIRAKIRA_MEMORY_AWS_ACCESS_KEY_ID", "S3_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID"),
    )
    aws_secret_access_key: str | None = Field(
        None,
        validation_alias=AliasChoices(
            "KIRAKIRA_MEMORY_AWS_SECRET_ACCESS_KEY",
            "S3_SECRET_ACCESS_KEY",
            "AWS_SECRET_ACCESS_KEY",
        ),
    )

    llm_model: str = "gpt-4o-mini"
    llm_api_key: str | None = None

    @model_validator(mode="after")
    def apply_qdrant_url(self) -> "MemoryPipelineConfig":
        if not self.qdrant_url:
            return self

        parsed = urlsplit(self.qdrant_url)
        if not parsed.scheme or not parsed.hostname:
            raise ValueError("QDRANT_URL must include a scheme and host")

        if "qdrant_host" not in self.model_fields_set:
            self.qdrant_host = parsed.hostname
        if "qdrant_port" not in self.model_fields_set and parsed.port is not None:
            self.qdrant_port = parsed.port
        return self
