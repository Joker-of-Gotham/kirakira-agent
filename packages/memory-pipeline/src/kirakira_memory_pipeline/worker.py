"""Redis stream consumer: materialize, forget, and reflect work queues."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import redis.asyncio as redis

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.embedding.openai_embedder import OpenAIEmbedder
from kirakira_memory_pipeline.materializer.blob_materializer import BlobMaterializer
from kirakira_memory_pipeline.materializer.graph_materializer import GraphMaterializer
from kirakira_memory_pipeline.materializer.vector_materializer import VectorMaterializer
from kirakira_memory_pipeline.reflect.belief_updater import BeliefUpdater
from kirakira_memory_pipeline.reflect.observation_consolidator import ObservationConsolidator
from kirakira_memory_pipeline.reflect.predict_calibrate import PredictCalibrateScorer, predict_calibrate_from_payload
from kirakira_memory_pipeline.scoring.retention_scorer import RetentionScorer

logger = logging.getLogger(__name__)

StreamHandler = Callable[[dict[str, Any]], Awaitable[None]]


def _decode_event(fields: dict[Any, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for raw_k, raw_v in fields.items():
        k = raw_k.decode() if isinstance(raw_k, bytes) else str(raw_k)
        if isinstance(raw_v, bytes):
            try:
                out[k] = raw_v.decode()
            except UnicodeDecodeError:
                out[k] = raw_v
        else:
            out[k] = raw_v
    return out


class MemoryPipelineWorker:
    """Consumes Redis streams and dispatches to domain handlers."""

    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        self._redis: redis.Redis | None = None
        self._vector = VectorMaterializer(self.config)
        self._graph = GraphMaterializer(self.config)
        self._blob = BlobMaterializer(self.config)
        self._observations = ObservationConsolidator(self.config)
        self._beliefs = BeliefUpdater(self.config)
        self._retention = RetentionScorer(self.config)
        self._embedder = OpenAIEmbedder(self.config)
        self._predict_calibrate = PredictCalibrateScorer(self._embedder)

    async def connect(self) -> None:
        if self._redis is None:
            self._redis = redis.from_url(self.config.redis_url, decode_responses=False)
        await self._ensure_groups()
        await self._vector.connect()
        await self._graph.connect()

    async def close(self) -> None:
        if self._redis is not None:
            await self._redis.aclose()
            self._redis = None
        await self._vector.close()
        await self._graph.close()

    async def _ensure_groups(self) -> None:
        assert self._redis is not None
        for stream in self._strkirakira_names():
            try:
                await self._redis.xgroup_create(
                    name=stream,
                    groupname=self.config.consumer_group,
                    id="0-0",
                    mkstream=True,
                )
            except redis.ResponseError as exc:
                if "BUSYGROUP" not in str(exc):
                    raise

    def _strkirakira_names(self) -> list[str]:
        return [
            self.config.redis_strkirakira_materialize,
            self.config.redis_strkirakira_forget,
            self.config.redis_strkirakira_reflect,
        ]

    async def _publish_optional_stream(self, payload: dict[str, Any], result: dict[str, Any]) -> None:
        out_stream = payload.get("result_stream")
        if not isinstance(out_stream, str):
            return
        client = redis.from_url(self.config.redis_url, decode_responses=True)
        try:
            await client.xadd(out_stream, {"data": json.dumps(result)})
        except Exception:
            logger.exception("failed to publish result to stream %s", out_stream)
        finally:
            await client.aclose()

    async def _handle_materialize(self, event: dict[str, Any]) -> None:
        op = str(event.get("op") or event.get("operation") or "upsert_vector")
        payload_raw = event.get("payload") or event.get("data") or "{}"
        if isinstance(payload_raw, str):
            payload: dict[str, Any] = json.loads(payload_raw)
        elif isinstance(payload_raw, dict):
            payload = payload_raw
        else:
            raise ValueError("materialize event requires string or dict payload")

        if op in {"vector", "upsert_vector", "qdrant"}:
            await self._vector.upsert_records(payload)
        elif op in {"graph", "upsert_graph", "neo4j"}:
            await self._graph.upsert_batch(payload)
        elif op in {"blob", "s3", "episode_blob"}:
            await self._blob.store_episode(payload)
        elif op in {"full", "all"}:
            await self._vector.upsert_records(payload.get("vector", payload))
            await self._graph.upsert_batch(payload.get("graph", {}))
            if blob := payload.get("blob"):
                await self._blob.store_episode(blob)
        else:
            raise ValueError(f"unknown materialize op: {op}")

    async def _handle_forget(self, event: dict[str, Any]) -> None:
        payload_raw = event.get("payload") or event.get("data") or "{}"
        if isinstance(payload_raw, str):
            payload: dict[str, Any] = json.loads(payload_raw)
        elif isinstance(payload_raw, dict):
            payload = payload_raw
        else:
            raise ValueError("forget event requires string or dict payload")

        await self._vector.delete_by_filter(payload.get("vector", {}))
        await self._graph.delete_entities(payload.get("graph", {}))
        await self._blob.delete_objects(payload.get("blob", {}))

    async def _handle_reflect(self, event: dict[str, Any]) -> None:
        payload_raw = event.get("payload") or event.get("data") or "{}"
        if isinstance(payload_raw, str):
            payload: dict[str, Any] = json.loads(payload_raw)
        elif isinstance(payload_raw, dict):
            payload = payload_raw
        else:
            raise ValueError("reflect event requires string or dict payload")

        op = str(event.get("op") or "consolidate")
        if op in {"consolidate", "observations"}:
            observations = await self._observations.consolidate(payload)
            await self._publish_optional_stream(
                payload,
                {"observations": [o.model_dump() for o in observations]},
            )
        elif op in {"beliefs", "update_beliefs"}:
            revisions = await self._beliefs.update_from_evidence(payload)
            await self._publish_optional_stream(
                payload,
                {"revisions": [r.model_dump() for r in revisions]},
            )
        elif op in {"score", "retention"}:
            await self._retention.score_and_publish(payload)
        elif op in {"predict_calibrate", "novelty", "importance"}:
            pc_result = await predict_calibrate_from_payload(self._predict_calibrate, payload)
            await self._publish_optional_stream(payload, pc_result)
        elif op in {"pipeline", "full"}:
            observations = await self._observations.consolidate(payload)
            revisions = await self._beliefs.update_from_evidence(payload)
            retention_result = await self._retention.score_and_publish(payload)
            await self._publish_optional_stream(payload, {
                "observations": [o.model_dump() for o in observations],
                "revisions": [r.model_dump() for r in revisions],
                "retention": retention_result,
            })
        else:
            raise ValueError(f"unknown reflect op: {op}")

    def _handler_for_stream(self, stream: str) -> StreamHandler:
        if stream == self.config.redis_strkirakira_materialize:
            return self._handle_materialize
        if stream == self.config.redis_strkirakira_forget:
            return self._handle_forget
        if stream == self.config.redis_strkirakira_reflect:
            return self._handle_reflect
        raise ValueError(f"unrecognized stream: {stream}")

    async def process_one(self, stream: str, message_id: str, fields: dict[Any, Any]) -> None:
        handler = self._handler_for_stream(stream)
        evt = _decode_event(fields)
        evt.setdefault("stream", stream)
        evt.setdefault("id", message_id)
        await handler(evt)

    async def run_forever(self) -> None:
        await self.connect()
        assert self._redis is not None
        streams = self._strkirakira_names()
        while True:
            try:
                resp = await self._redis.xreadgroup(
                    groupname=self.config.consumer_group,
                    consumername=self.config.consumer_name,
                    streams={s: ">" for s in streams},
                    count=self.config.batch_size,
                    block=self.config.poll_timeout_ms,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("xreadgroup failed; backing off")
                await asyncio.sleep(1.0)
                continue

            if not resp:
                continue

            for strkirakira_name, messages in resp:
                s = strkirakira_name.decode() if isinstance(strkirakira_name, bytes) else str(strkirakira_name)
                for msg_id, raw_fields in messages:
                    mid = msg_id.decode() if isinstance(msg_id, bytes) else str(msg_id)
                    try:
                        await self.process_one(s, mid, dict(raw_fields))
                    except Exception:
                        logger.exception("handler failed stream=%s id=%s", s, mid)
                        continue
                    try:
                        await self._redis.xack(s, self.config.consumer_group, mid)
                    except Exception:
                        logger.exception("xack failed stream=%s id=%s", s, mid)


async def run_worker(config: MemoryPipelineConfig | None = None) -> None:
    worker = MemoryPipelineWorker(config)
    await worker.run_forever()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
