"""Qdrant vector materialization."""

from __future__ import annotations

from typing import Any

from qdrant_client import AsyncQdrantClient
from qdrant_client.http import models as qm

from kirakira_memory_pipeline.config import MemoryPipelineConfig


class VectorMaterializer:
    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        self._client: AsyncQdrantClient | None = None

    async def connect(self) -> None:
        if self._client is None:
            self._client = AsyncQdrantClient(
                host=self.config.qdrant_host,
                port=self.config.qdrant_port,
            )

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None

    async def _ensure_collection(self, collection: str, size: int) -> None:
        assert self._client is not None
        existing = await self._client.get_collections()
        names = {c.name for c in existing.collections}
        if collection in names:
            return
        await self._client.create_collection(
            collection_name=collection,
            vectors_config=qm.VectorParams(size=size, distance=qm.Distance.COSINE),
        )

    @staticmethod
    def _point_id(raw: str | int) -> str | int:
        if isinstance(raw, int):
            return raw
        if raw.isdigit():
            return int(raw)
        return raw

    async def upsert_records(self, batch: dict[str, Any]) -> None:
        await self.connect()
        assert self._client is not None
        collection = str(batch.get("collection") or self.config.qdrant_collection)
        points_raw = batch.get("points")
        if not isinstance(points_raw, list):
            raise ValueError("vector upsert requires batch['points'] as a list")

        parsed: list[qm.PointStruct] = []
        for item in points_raw:
            if not isinstance(item, dict):
                raise ValueError("each point must be an object")
            pid = item.get("id")
            vector = item.get("vector")
            payload = item.get("payload") or {}
            if pid is None or vector is None:
                raise ValueError("each point requires id and vector")
            if not isinstance(vector, list):
                raise ValueError("vector must be a list of floats")
            parsed.append(
                qm.PointStruct(
                    id=self._point_id(str(pid)),
                    vector=[float(x) for x in vector],
                    payload=dict(payload),
                )
            )

        if not parsed:
            return
        size = len(parsed[0].vector)
        await self._ensure_collection(collection, size)
        await self._client.upsert(collection_name=collection, points=parsed, wait=True)

    async def delete_by_filter(self, spec: dict[str, Any]) -> None:
        if not spec:
            return
        await self.connect()
        assert self._client is not None
        collection = str(spec.get("collection") or self.config.qdrant_collection)
        must: list[qm.FieldCondition] = []
        for field, value in spec.get("match", {}).items():
            must.append(qm.FieldCondition(key=field, match=qm.MatchValue(value=value)))
        if not must:
            point_ids = spec.get("ids")
            if isinstance(point_ids, list) and point_ids:
                await self._client.delete(
                    collection_name=collection,
                    points_selector=qm.PointIdsList(points=[self._point_id(str(i)) for i in point_ids]),
                    wait=True,
                )
            return
        await self._client.delete(
            collection_name=collection,
            points_selector=qm.FilterSelector(
                filter=qm.Filter(must=must),
            ),
            wait=True,
        )
