"""Roll-ups of granular facts into human-readable observations."""

from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.extraction.fact_extractor import Fact


class Observation(BaseModel):
    summary: str = Field(min_length=1)
    entity_ids: list[str] = Field(default_factory=list)
    supporting_facts: list[str] = Field(default_factory=list)


class ObservationBatch(BaseModel):
    observations: list[Observation]


class ObservationConsolidator:
    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        key = self.config.llm_api_key or self.config.embedding_api_key
        self._client = AsyncOpenAI(api_key=key) if key else AsyncOpenAI()

    @staticmethod
    def _normalize_facts(raw: Any) -> list[Fact]:
        if isinstance(raw, list) and raw and isinstance(raw[0], Fact):
            return list(raw)
        out: list[Fact] = []
        if not isinstance(raw, list):
            return out
        for item in raw:
            if isinstance(item, dict):
                data = dict(item)
                if "object" not in data and "obj" in data:
                    data["object"] = data.pop("obj")
                try:
                    out.append(Fact.model_validate(data))
                except Exception:
                    continue
        return out

    def _facts_from_payload(self, payload: dict[str, Any]) -> list[Fact]:
        for key in ("facts", "items", "records"):
            raw = payload.get(key)
            if isinstance(raw, list):
                return self._normalize_facts(raw)
        return []

    async def consolidate(self, payload: dict[str, Any]) -> list[Observation]:
        facts = self._facts_from_payload(payload)
        if not facts:
            return []

        lines = [f"- {f.subject} | {f.predicate} | {f.object} (p={f.confidence:.2f})" for f in facts]
        bundle = "\n".join(lines[:200])
        resp = await self._client.beta.chat.completions.parse(
            model=self.config.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Group the atomic facts into a small set of consolidated observations. "
                        "Each observation should cite which facts it summarizes in supporting_facts "
                        "(reuse the full fact line text). entity_ids should name key entities involved."
                    ),
                },
                {"role": "user", "content": bundle},
            ],
            response_format=ObservationBatch,
        )
        parsed = resp.choices[0].message.parsed
        if parsed is None:
            return []
        return [o for o in parsed.observations if o.summary]
