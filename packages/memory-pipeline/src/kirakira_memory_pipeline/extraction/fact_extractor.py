"""Subject–predicate–object extraction with structured LLM output."""

from __future__ import annotations

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from kirakira_memory_pipeline.config import MemoryPipelineConfig


class Fact(BaseModel):
    subject: str = Field(min_length=1)
    predicate: str = Field(min_length=1)
    object: str = Field(min_length=1)
    confidence: float = Field(ge=0.0, le=1.0, default=1.0)


class FactsWrapper(BaseModel):
    facts: list[Fact]


class FactExtractor:
    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        api_key = self.config.llm_api_key or self.config.embedding_api_key
        self._client = AsyncOpenAI(api_key=api_key) if api_key else AsyncOpenAI()

    async def extract(self, text: str, *, language: str | None = None) -> list[Fact]:
        system = (
            "Extract concise factual triples (subject, predicate, object) from the user text. "
            "Use normalized verb forms in English for predicate. "
            "If a fact is uncertain, lower confidence below 1.0."
        )
        user = text if not language else f"Language hint: {language}\n\n{text}"

        resp = await self._client.beta.chat.completions.parse(
            model=self.config.llm_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format=FactsWrapper,
        )
        parsed = resp.choices[0].message.parsed
        if parsed is None:
            return []
        return [f for f in parsed.facts if f.subject and f.predicate and f.object]
