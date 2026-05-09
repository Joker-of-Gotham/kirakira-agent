import type { MemoryRecord } from "@kirakira/memory-core";

import { coverageGainForRecord, measureRecordCoverage } from "./coverage-scorer.js";

function tokenize(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\W+/u).filter((t) => t.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export interface RerankerOptions {
  /** Optional cross-encoder scores by record id (higher = better). */
  crossEncoder?: Map<string, number>;
  coverageBonusWeight?: number;
  redundancyPenaltyWeight?: number;
}

export class RetrievalReranker {
  rerank(
    fused: Array<{ record: MemoryRecord; score: number }>,
    opts: RerankerOptions = {},
  ): Array<{ record: MemoryRecord; score: number; reason: string }> {
    const covBonusW = opts.coverageBonusWeight ?? 0.35;
    const redPenW = opts.redundancyPenaltyWeight ?? 0.25;
    const cross = opts.crossEncoder;

    const tokenCache = new Map<string, Set<string>>();
    const getTok = (r: MemoryRecord): Set<string> => {
      const key = r.id;
      const got = tokenCache.get(key);
      if (got) return got;
      const t = tokenize([r.text, r.summaryL0, r.overviewL1].filter(Boolean).join(" "));
      tokenCache.set(key, t);
      return t;
    };

    const out: Array<{ record: MemoryRecord; score: number; reason: string }> = [];
    const accepted: MemoryRecord[] = [];

    const sorted = [...fused].sort((a, b) => b.score - a.score);

    for (const { record, score } of sorted) {
      let adj = score;
      const reasons: string[] = [`fusion:${score.toFixed(4)}`];

      if (cross?.has(record.id)) {
        const ce = cross.get(record.id)!;
        adj += 0.15 * ce;
        reasons.push(`cross:${ce.toFixed(4)}`);
      }

      const gain = coverageGainForRecord(
        measureRecordCoverage(accepted),
        record,
      );
      adj += covBonusW * gain;
      reasons.push(`coverage+${(covBonusW * gain).toFixed(4)}`);

      let maxJac = 0;
      const tok = getTok(record);
      for (const existing of accepted) {
        maxJac = Math.max(maxJac, jaccard(tok, getTok(existing)));
      }
      adj -= redPenW * maxJac;
      reasons.push(`redundancy-${(redPenW * maxJac).toFixed(4)}`);

      out.push({ record, score: adj, reason: reasons.join("; ") });
      accepted.push(record);
    }

    return out.sort((a, b) => b.score - a.score);
  }
}
