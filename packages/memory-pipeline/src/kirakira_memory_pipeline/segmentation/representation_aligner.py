"""Snap semantic boundaries to natural sentence or paragraph breaks."""

from __future__ import annotations

import re


class RepresentationAligner:
    """Adjusts raw boundary positions to land on paragraph or sentence edges."""

    def __init__(self, *, prefer_paragraphs: bool = True) -> None:
        self.prefer_paragraphs = prefer_paragraphs

    def _paragraph_spans(self, text: str) -> list[tuple[int, int]]:
        parts = [m for m in re.finditer(r"(?:\n\s*){2,}", text)]
        if not parts:
            return [(0, len(text))]
        spans: list[tuple[int, int]] = []
        start = 0
        for m in parts:
            spans.append((start, m.start()))
            start = m.end()
        spans.append((start, len(text)))
        return [(a, b) for a, b in spans if b > a]

    def _sentence_offsets(self, segment: str, base: int) -> list[int]:
        cuts: list[int] = [base]
        for m in re.finditer(r"(?<=[.!?])\s+", segment):
            cuts.append(base + m.end())
        cuts.append(base + len(segment))
        return sorted(set(cuts))

    def align_boundaries(self, text: str, char_boundaries: list[int]) -> list[int]:
        if not char_boundaries:
            return []
        boundaries = sorted(set(char_boundaries))
        aligned: list[int] = []

        if self.prefer_paragraphs:
            para_spans = self._paragraph_spans(text)
            cursor = 0
            for b in boundaries:
                chosen = b
                for start, end in para_spans:
                    if start <= b < end:
                        para = text[start:end]
                        sentences = self._sentence_offsets(para, start)
                        after = [s for s in sentences if s <= b]
                        chosen = after[-1] if after else start
                        break
                aligned.append(max(chosen, cursor))
                cursor = aligned[-1]
        else:
            cursor = 0
            sentences = self._sentence_offsets(text, 0)
            for b in boundaries:
                snap = [s for s in sentences if s <= b]
                chosen = snap[-1] if snap else b
                chosen = max(chosen, cursor)
                aligned.append(chosen)
                cursor = chosen

        return sorted(set(aligned))
