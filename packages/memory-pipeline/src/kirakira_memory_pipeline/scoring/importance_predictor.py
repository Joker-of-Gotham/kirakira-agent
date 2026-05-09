"""Information-gain style heuristic for new content."""

from __future__ import annotations

import math
from collections import Counter


class ImportancePredictor:
    """Estimates how much a new snippet expands known n-gram coverage (surrogate for information gain)."""

    def __init__(self, *, ngram_range: tuple[int, int] = (1, 3)) -> None:
        self.ngram_range = ngram_range

    @staticmethod
    def _tokens(text: str) -> list[str]:
        return [t for t in "".join(ch.lower() if ch.isalnum() else " " for ch in text).split() if t]

    def _ngrams(self, tokens: list[str]) -> Counter[str]:
        counts: Counter[str] = Counter()
        lo, hi = self.ngram_range
        for n in range(lo, hi + 1):
            if len(tokens) < n:
                continue
            for i in range(len(tokens) - n + 1):
                counts[" ".join(tokens[i : i + n])] += 1
        return counts

    def predict_gain(self, new_text: str, corpus: list[str]) -> float:
        history = Counter[str]()
        for doc in corpus:
            history.update(self._ngrams(self._tokens(doc)))
        new_counts = self._ngrams(self._tokens(new_text))
        if not new_counts:
            return 0.0
        novel = 0
        for gram, c in new_counts.items():
            if history[gram] == 0:
                novel += c
        total = sum(new_counts.values())
        ratio = novel / total
        return round(max(0.0, min(1.0, 0.5 + 0.5 * math.tanh(ratio - 0.25))), 4)
