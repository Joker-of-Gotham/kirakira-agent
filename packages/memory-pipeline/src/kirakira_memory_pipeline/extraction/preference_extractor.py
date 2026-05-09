"""Preference statements mined from dialogue."""

from __future__ import annotations

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from kirakira_memory_pipeline.config import MemoryPipelineConfig


class Preference(BaseModel):
    statement: str = Field(min_length=1)
    polarity: str = Field(description="prefer|avoid|neutral")
    confidence: float = Field(ge=0.0, le=1.0, default=0.9)
    scope: str | None = None


class PreferenceBatch(BaseModel):
    preferences: list[Preference]


class PreferenceExtractor:
    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        key = self.config.llm_api_key or self.config.embedding_api_key
        self._client = AsyncOpenAI(api_key=key) if key else AsyncOpenAI()

    async def extract(self, text: str) -> list[Preference]:
        resp = await self._client.beta.chat.completions.parse(
            model=self.config.llm_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract durable user preferences from conversational text. "
                        "Look for 'I prefer', 'always', 'never', 'I like', 'I hate', "
                        "'default to', 'use X for Y'. Skip one-off instructions unless they imply policy."
                    ),
                },
                {"role": "user", "content": text},
            ],
            response_format=PreferenceBatch,
        )
        parsed = resp.choices[0].message.parsed
        if parsed is None:
            return []
        return [p for p in parsed.preferences if p.statement]
