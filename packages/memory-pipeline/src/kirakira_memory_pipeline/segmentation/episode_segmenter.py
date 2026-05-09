"""Two-step semantic episode segmentation (embedding boundaries + linguistic alignment)."""

from __future__ import annotations

from dataclasses import dataclass

import tiktoken

from kirakira_memory_pipeline.embedding.embedder import Embedder
from kirakira_memory_pipeline.segmentation.boundary_detector import SemanticBoundaryDetector
from kirakira_memory_pipeline.segmentation.representation_aligner import RepresentationAligner


@dataclass
class Episode:
    text: str
    start_char: int
    end_char: int


class EpisodeSegmenter:
    """Token-window chunking, embedding similarity boundaries, then sentence/paragraph snap."""

    def __init__(
        self,
        *,
        encoding_name: str = "cl100k_base",
        boundary_detector: SemanticBoundaryDetector | None = None,
        aligner: RepresentationAligner | None = None,
    ) -> None:
        self._encoding = tiktoken.get_encoding(encoding_name)
        self._boundaries = boundary_detector or SemanticBoundaryDetector()
        self._aligner = aligner or RepresentationAligner()

    def _chunks(self, text: str, *, target_tokens: int, stride_tokens: int) -> tuple[list[str], list[tuple[int, int]]]:
        tokens = self._encoding.encode(text)
        chunks: list[str] = []
        spans: list[tuple[int, int]] = []
        if not tokens:
            return [""], [(0, len(text))]

        start = 0
        while start < len(tokens):
            end = min(len(tokens), start + target_tokens)
            token_slice = tokens[start:end]
            piece = self._encoding.decode(token_slice)
            # Map approximate char span by searching forward from last end
            char_start = spans[-1][1] if spans else 0
            idx = text.find(piece.strip()[: min(32, len(piece))], char_start)
            char_start = idx if idx != -1 else char_start
            char_end = char_start + len(piece)
            chunks.append(piece)
            spans.append((char_start, min(char_end, len(text))))
            if end >= len(tokens):
                break
            start += stride_tokens
        return chunks, spans

    async def segment(
        self,
        text: str,
        embedder: Embedder,
        *,
        target_tokens: int = 180,
        stride_tokens: int = 90,
    ) -> list[Episode]:
        stripped = text.strip()
        if not stripped:
            return []

        chunk_texts, spans = self._chunks(stripped, target_tokens=target_tokens, stride_tokens=stride_tokens)
        if len(chunk_texts) == 1:
            s, e = spans[0]
            return [Episode(stripped[s:e], s, e)]

        boundary_chunk_idxs = await self._boundaries.boundary_indices(chunk_texts, embedder)
        char_candidates: list[int] = []
        for idx in boundary_chunk_idxs:
            if idx + 1 < len(spans):
                _, end_prev = spans[idx]
                start_next, _ = spans[idx + 1]
                char_candidates.append(max(end_prev, start_next))

        aligned = self._aligner.align_boundaries(stripped, char_candidates)
        cuts = [0] + sorted({c for c in aligned if 0 < c < len(stripped)}) + [len(stripped)]

        episodes: list[Episode] = []
        for i in range(len(cuts) - 1):
            a, b = cuts[i], cuts[i + 1]
            seg = stripped[a:b].strip()
            if seg:
                episodes.append(Episode(seg, a, b))
        return episodes
