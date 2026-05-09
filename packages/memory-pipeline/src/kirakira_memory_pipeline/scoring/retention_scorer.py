"""Composite retention score combining novelty, density, and source reliability."""

from __future__ import annotations

import json
import logging
from typing import Any

import redis.asyncio as redis

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.embedding.openai_embedder import OpenAIEmbedder
from kirakira_memory_pipeline.extraction.entity_extractor import EntityExtractor
from kirakira_memory_pipeline.extraction.fact_extractor import FactExtractor
from kirakira_memory_pipeline.reflect.predict_calibrate import PredictCalibrateScorer
from kirakira_memory_pipeline.scoring.importance_predictor import ImportancePredictor

logger = logging.getLogger(__name__)


class RetentionScorer:
    """Higher scores recommend retaining/storing the item."""

    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        self._predictor = ImportancePredictor()
        self._embedder = OpenAIEmbedder(self.config)
        self._pc = PredictCalibrateScorer(self._embedder)
        self._entities = EntityExtractor(self.config)
        self._facts = FactExtractor(self.config)

    @staticmethod
    def _density(count: int, length: int) -> float:
        if length <= 0:
            return 0.0
        return max(0.0, min(1.0, count / max(1.0, length / 400.0)))

    async def score(
        self,
        *,
        text: str,
        memory_vectors: list[list[float]] | None = None,
        corpus: list[str] | None = None,
        source_reliability: float = 0.7,
    ) -> dict[str, Any]:
        if not text.strip():
            return {"retention": 0.0, "components": {}}
        memory_vectors = memory_vectors or []
        corpus = corpus or []

        novelty = await self._pc.score(text, memory_vectors)
        ngram_gain = self._predictor.predict_gain(text, corpus)
        entities = await self._entities.extract(text)
        facts = await self._facts.extract(text)
        entity_density = self._density(len(entities), len(text))
        fact_density = self._density(len(facts), len(text))
        rel = max(0.0, min(1.0, source_reliability))

        retention = 0.35 * novelty + 0.2 * ngram_gain + 0.15 * entity_density + 0.2 * fact_density + 0.1 * rel
        retention = round(max(0.0, min(1.0, retention)), 4)
        return {
            "retention": retention,
            "components": {
                "novelty": novelty,
                "ngram_information": ngram_gain,
                "entity_density": round(entity_density, 4),
                "fact_density": round(fact_density, 4),
                "source_reliability": rel,
            },
        }

    async def score_and_publish(self, payload: dict[str, Any]) -> dict[str, Any]:
        text = str(payload.get("text") or "")
        memory_vectors = payload.get("memory_vectors") or []
        parsed_vectors: list[list[float]] = []
        if isinstance(memory_vectors, list):
            for row in memory_vectors:
                if isinstance(row, list):
                    parsed_vectors.append([float(x) for x in row])

        corpus = payload.get("corpus") or []
        corpus_list = [str(x) for x in corpus] if isinstance(corpus, list) else []

        result = await self.score(
            text=text,
            memory_vectors=parsed_vectors,
            corpus=corpus_list,
            source_reliability=float(payload.get("source_reliability", 0.7)),
        )

        out_stream = payload.get("result_stream")
        if isinstance(out_stream, str):
            r = redis.from_url(self.config.redis_url, decode_responses=True)
            try:
                await r.xadd(out_stream, {"data": json.dumps(result)})
            except Exception:
                logger.exception("failed to publish retention score")
            finally:
                await r.aclose()

        return result
