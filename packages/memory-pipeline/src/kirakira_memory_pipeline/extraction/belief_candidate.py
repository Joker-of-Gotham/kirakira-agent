"""Belief proposals synthesized from factual extractions."""

from __future__ import annotations

from collections import defaultdict

from pydantic import BaseModel, Field

from kirakira_memory_pipeline.extraction.fact_extractor import Fact


class BeliefCandidate(BaseModel):
    belief: str = Field(min_length=1)
    support_facts: list[Fact] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0, default=0.6)


class BeliefCandidateGenerator:
    """Groups SPO facts by shared subjects to propose consolidated beliefs."""

    def propose(self, facts: list[Fact]) -> list[BeliefCandidate]:
        if not facts:
            return []
        by_subject: dict[str, list[Fact]] = defaultdict(list)
        for f in facts:
            by_subject[f.subject.casefold()].append(f)

        candidates: list[BeliefCandidate] = []
        for _, group in by_subject.items():
            if len(group) < 2:
                continue
            verbs = sorted({f.predicate for f in group})
            objs = sorted({f.object for f in group})
            belief = (
                f"Regarding {group[0].subject}, the model repeatedly observes: "
                f"{'; '.join(f'{f.predicate} {f.object}' for f in group[:5])}"
            )
            conf = min(1.0, sum(f.confidence for f in group) / max(1, len(group)))
            if len(verbs) + len(objs) >= 3:
                conf = min(1.0, conf + 0.1)
            candidates.append(
                BeliefCandidate(
                    belief=belief,
                    support_facts=list(group),
                    confidence=round(conf, 4),
                )
            )
        return candidates
