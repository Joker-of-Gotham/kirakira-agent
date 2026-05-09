"""Belief revision with simple confidence bookkeeping."""

from __future__ import annotations

import math
from typing import Any

from pydantic import BaseModel, Field

from kirakira_memory_pipeline.config import MemoryPipelineConfig
from kirakira_memory_pipeline.extraction.belief_candidate import BeliefCandidateGenerator
from kirakira_memory_pipeline.extraction.fact_extractor import Fact


class BeliefState(BaseModel):
    belief_text: str
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    supporting_ids: list[str] = Field(default_factory=list)
    contradicting_ids: list[str] = Field(default_factory=list)


class BeliefRevision(BaseModel):
    belief: BeliefState
    notes: str | None = None


class BeliefUpdater:
    """Deterministic update rules; callers may persist revisions externally."""

    def __init__(self, config: MemoryPipelineConfig | None = None) -> None:
        self.config = config or MemoryPipelineConfig()
        self._generator = BeliefCandidateGenerator()

    @staticmethod
    def _support_score(facts: list[Fact]) -> float:
        if not facts:
            return 0.0
        return sum(max(0.0, min(1.0, f.confidence)) for f in facts) / len(facts)

    async def update_from_evidence(self, payload: dict[str, Any]) -> list[BeliefRevision]:
        facts = _extract_facts(payload)
        refuting = _extract_facts_from_key(payload, "refuting_facts")
        candidates = self._generator.propose(facts)
        revisions: list[BeliefRevision] = []
        for cand in candidates:
            support = self._support_score(cand.support_facts)
            prior = cand.confidence
            posterior = 1.0 - (1.0 - prior) * math.exp(-support)
            posterior = max(0.0, min(1.0, posterior))
            contradicting_ids: list[str] = []
            for rf in refuting:
                for sf in cand.support_facts:
                    if _fact_conflicts(sf, rf):
                        contradicting_ids.append(f"{rf.subject}|{rf.predicate}|{rf.object}")
            contradicting_ids = list(dict.fromkeys(contradicting_ids))
            if contradicting_ids:
                posterior *= max(0.15, 1.0 - 0.25 * len(contradicting_ids))
                posterior = max(0.0, min(1.0, posterior))
            notes = "reinforced by grouped facts" if not contradicting_ids else "adjusted for refuting evidence"
            belief = BeliefState(
                belief_text=cand.belief,
                confidence=round(posterior, 4),
                supporting_ids=[f"{f.subject}|{f.predicate}|{f.object}" for f in cand.support_facts],
                contradicting_ids=contradicting_ids,
            )
            revisions.append(BeliefRevision(belief=belief, notes=notes))
        return revisions


def _fact_conflicts(supported: Fact, refuting: Fact) -> bool:
    if supported.subject.casefold() != refuting.subject.casefold():
        return False
    pred_a = supported.predicate.casefold()
    pred_b = refuting.predicate.casefold()
    if pred_a != pred_b:
        return False
    return supported.object.casefold() != refuting.object.casefold()


def _extract_facts_from_key(payload: dict[str, Any], key: str) -> list[Fact]:
    facts_raw = payload.get(key)
    if not isinstance(facts_raw, list):
        return []
    out: list[Fact] = []
    for item in facts_raw:
        if isinstance(item, Fact):
            out.append(item)
        elif isinstance(item, dict):
            try:
                out.append(
                    Fact.model_validate(
                        {
                            **item,
                            "object": item.get("object") or item.get("obj") or "",
                        }
                    )
                )
            except Exception:
                continue
    return out


def _extract_facts(payload: dict[str, Any]) -> list[Fact]:
    return _extract_facts_from_key(payload, "facts")
