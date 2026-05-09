"""Named-entity extraction with normalization and deduplication."""

from __future__ import annotations

import re

from openai import APIError, AsyncOpenAI
from pydantic import BaseModel, Field

from kirakira_memory_pipeline.config import MemoryPipelineConfig

EntityTuple = tuple[str, str, str]


class ExtractedEntity(BaseModel):
    text: str = Field(min_length=1)
    entity_type: str = Field(min_length=1)
    canonical_form: str = Field(min_length=1)
    mentions: list[str] = Field(default_factory=list)


class EntityBatch(BaseModel):
    entities: list[ExtractedEntity]


class EntityExtractor:
    """LLM-powered NER with post-processing deduplication."""

    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        key = self.config.llm_api_key or self.config.embedding_api_key
        self._client = AsyncOpenAI(api_key=key) if key else AsyncOpenAI()

    @staticmethod
    def _normalize_key(canonical: str, entity_type: str) -> str:
        base = canonical.casefold().strip()
        collapsed = re.sub(r"\s+", " ", base)
        return f"{entity_type.casefold()}::{collapsed}"

    @staticmethod
    def _merge_mentions(*groups: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for group in groups:
            for m in group:
                mk = m.strip()
                if not mk:
                    continue
                ck = mk.casefold()
                if ck in seen:
                    continue
                seen.add(ck)
                out.append(mk)
        return out

    async def extract(self, text: str) -> list[EntityTuple]:
        try:
            resp = await self._client.beta.chat.completions.parse(
                model=self.config.llm_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Extract named entities with types (PERSON, ORG, GPE, PRODUCT, EVENT, WORK_OF_ART, "
                            "DATE, MONEY, NORP, FAC, LAW, LANGUAGE, MISC). "
                            "canonical_form should be a normalized title case or official spelling. "
                            "mentions must include the surface form in text and close aliases."
                        ),
                    },
                    {"role": "user", "content": text},
                ],
                response_format=EntityBatch,
            )
        except APIError as exc:
            raise RuntimeError(f"OpenAI entity extraction failed: {exc}") from exc
        parsed = resp.choices[0].message.parsed
        if parsed is None:
            return []

        buckets: dict[str, ExtractedEntity] = {}
        for ent in parsed.entities:
            key = self._normalize_key(ent.canonical_form, ent.entity_type)
            if key not in buckets:
                buckets[key] = ExtractedEntity(
                    text=ent.text,
                    entity_type=ent.entity_type,
                    canonical_form=ent.canonical_form,
                    mentions=self._merge_mentions([ent.text], ent.mentions),
                )
            else:
                cur = buckets[key]
                cur.mentions = self._merge_mentions(cur.mentions, [ent.text], ent.mentions)

        return [(e.text, e.entity_type, e.canonical_form) for e in buckets.values()]
