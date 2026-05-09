"""Object storage for raw episode payloads (S3-compatible)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from kirakira_memory_pipeline.config import MemoryPipelineConfig


class BlobMaterializer:
    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        self._client = None

    def _s3(self):
        if self._client is None:
            session_kw: dict[str, Any] = {}
            if self.config.aws_access_key_id and self.config.aws_secret_access_key:
                session_kw["aws_access_key_id"] = self.config.aws_access_key_id
                session_kw["aws_secret_access_key"] = self.config.aws_secret_access_key
            self._client = boto3.client(
                "s3",
                region_name=self.config.s3_region,
                endpoint_url=self.config.s3_endpoint_url,
                **session_kw,
            )
        return self._client

    async def store_episode(self, payload: dict[str, Any]) -> None:
        key = str(payload.get("key") or payload.get("id"))
        body = payload.get("body")
        if body is None and "text" in payload:
            body = json.dumps({"text": payload.get("text"), "meta": payload.get("meta", {})}).encode()
        elif isinstance(body, str):
            body = body.encode()
        elif isinstance(body, dict):
            body = json.dumps(body, ensure_ascii=False).encode()
        if not isinstance(body, (bytes, bytearray)):
            raise ValueError("episode blob requires body bytes or serializable text/meta")
        bucket = str(payload.get("bucket") or self.config.s3_bucket)
        extra: dict[str, Any] = {}
        if content_type := payload.get("content_type"):
            extra["ContentType"] = str(content_type)

        def _put() -> None:
            try:
                self._s3().put_object(Bucket=bucket, Key=key, Body=bytes(body), **extra)
            except (BotoCoreError, ClientError) as exc:
                raise RuntimeError(f"S3 put_object failed: {exc}") from exc

        await asyncio.to_thread(_put)

    async def delete_objects(self, spec: dict[str, Any]) -> None:
        keys = spec.get("keys")
        bucket = str(spec.get("bucket") or self.config.s3_bucket)
        if not isinstance(keys, list) or not keys:
            return

        def _del() -> None:
            try:
                self._s3().delete_objects(
                    Bucket=bucket,
                    Delete={"Objects": [{"Key": str(k)} for k in keys], "Quiet": True},
                )
            except (BotoCoreError, ClientError) as exc:
                raise RuntimeError(f"S3 delete_objects failed: {exc}") from exc

        await asyncio.to_thread(_del)
