"""BGE-M3 embedding backend: local SentenceTransformers or remote HTTP inference."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.embedding.embedder import Embedder

logger = logging.getLogger(__name__)


class BGEM3Embedder(Embedder):
    """Produces dense embeddings via BAAI/bge-m3.

    Two modes controlled by ``config.bge_mode``:

    * ``"local"`` – loads the model through ``sentence_transformers`` in-process.
      Requires ``pip install sentence-transformers``.
    * ``"http"`` (default) – sends requests to a TEI / vLLM / OpenAI-compatible
      endpoint at ``config.bge_http_url``.
    """

    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        self._dim = self.config.bge_dimension
        self._mode = self.config.bge_mode
        self._local_model: Any = None
        self._http_client: httpx.AsyncClient | None = None

    @property
    def dimension(self) -> int:
        return self._dim

    def _load_local(self) -> Any:
        if self._local_model is not None:
            return self._local_model
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "bge_mode='local' requires sentence-transformers: "
                "pip install sentence-transformers"
            ) from exc
        self._local_model = SentenceTransformer(
            self.config.bge_model_name,
            trust_remote_code=True,
        )
        return self._local_model

    async def _embed_local(self, texts: list[str]) -> list[list[float]]:
        model = self._load_local()

        def _encode() -> list[list[float]]:
            vecs = model.encode(
                texts,
                normalize_embeddings=True,
                show_progress_bar=False,
                batch_size=self.config.embedding_batch_size,
            )
            return [list(map(float, row)) for row in vecs]

        return await asyncio.to_thread(_encode)

    def _get_http_client(self) -> httpx.AsyncClient:
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=60.0)
        return self._http_client

    async def _embed_http(self, texts: list[str]) -> list[list[float]]:
        client = self._get_http_client()
        url = self.config.bge_http_url
        all_vecs: list[list[float]] = []

        bs = self.config.embedding_batch_size
        for i in range(0, len(texts), bs):
            batch = texts[i : i + bs]
            payload: dict[str, Any] = {"inputs": batch}
            if self.config.bge_max_length:
                payload["truncate"] = True

            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            body = resp.json()

            if isinstance(body, list) and body and isinstance(body[0], list):
                all_vecs.extend([list(map(float, v)) for v in body])
            elif isinstance(body, dict) and "data" in body:
                items = sorted(body["data"], key=lambda d: d.get("index", 0))
                all_vecs.extend([list(map(float, d["embedding"])) for d in items])
            elif isinstance(body, dict) and "embeddings" in body:
                all_vecs.extend([list(map(float, v)) for v in body["embeddings"]])
            else:
                raise RuntimeError(
                    f"Unexpected embedding response shape from {url}: "
                    f"keys={list(body.keys()) if isinstance(body, dict) else type(body)}"
                )

        return all_vecs

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        sanitized = [t if t.strip() else " " for t in texts]
        if self._mode == "local":
            return await self._embed_local(sanitized)
        return await self._embed_http(sanitized)

    async def close(self) -> None:
        if self._http_client is not None and not self._http_client.is_closed:
            await self._http_client.aclose()
            self._http_client = None
