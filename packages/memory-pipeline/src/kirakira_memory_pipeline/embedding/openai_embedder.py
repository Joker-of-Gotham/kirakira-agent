"""OpenAI embedding models (text-embedding-3-small / text-embedding-3-large)."""

from __future__ import annotations

from openai import AsyncOpenAI

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.embedding.embedder import Embedder

_DIMS: dict[str, int] = {
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
}


class OpenAIEmbedder(Embedder):
    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        key = self.config.embedding_api_key
        self._client = AsyncOpenAI(api_key=key) if key else AsyncOpenAI()
        self._model = self.config.embedding_model

    @property
    def dimension(self) -> int:
        if self._model in _DIMS:
            return _DIMS[self._model]
        return 1536

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        sanitized = [t if t.strip() else " " for t in texts]
        try:
            resp = await self._client.embeddings.create(model=self._model, input=sanitized)
        except Exception as exc:
            raise RuntimeError(f"OpenAI embedding request failed: {exc}") from exc
        ordered = sorted(resp.data, key=lambda d: d.index)
        return [list(map(float, item.embedding)) for item in ordered]
