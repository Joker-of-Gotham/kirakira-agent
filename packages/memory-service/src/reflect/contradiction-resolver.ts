import type { MemoryRecord } from "@kirakira/memory-core";

export interface ContradictionResolution {
  winnerId: string;
  loserId: string;
  reason: "higher_source_confidence" | "higher_recency_tie_break" | "spo_semantic_conflict";
}

export interface ContradictionResolverConfig {
  defaultConfidence?: number;
  baseScore?: number;
  entityScoreBoost?: number;
}

const NEGATION = /\b(not|no longer|never|false|isn't|aren't|wasn't|weren't|cannot|can't|won't|doesn't|don't|didn't)\b/i;

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/\W+/u).filter((w) => w.length > 2);
}

function extractSPO(text: string): { subject: string; predicate: string; object: string } | null {
  const pipes = text.split("|").map((s) => s.trim());
  if (pipes.length >= 3) {
    return { subject: pipes[0]!, predicate: pipes[1]!, object: pipes[2]! };
  }
  const copula =
    /^(.+?)\s+\b(is|are|was|were|equals|means|has|have|uses?|requires?|supports?|contains?)\b\s+(.+)$/i;
  const m = copula.exec(text.trim());
  if (m) {
    return { subject: m[1]!.trim(), predicate: m[2]!.trim().toLowerCase(), object: m[3]!.trim() };
  }
  return null;
}

function jaccardTokens(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Pairwise contradiction scan using SPO triple semantic comparison when available,
 * falling back to entity-overlap + negation detection.
 */
export class ContradictionResolver {
  private readonly cfg: Required<ContradictionResolverConfig>;

  constructor(config?: ContradictionResolverConfig) {
    this.cfg = {
      defaultConfidence: config?.defaultConfidence ?? 0.7,
      baseScore: config?.baseScore ?? 0.65,
      entityScoreBoost: config?.entityScoreBoost ?? 0.1,
    };
  }

  detectContradictions(facts: MemoryRecord[]): Array<{ a: MemoryRecord; b: MemoryRecord; score: number }> {
    const out: Array<{ a: MemoryRecord; b: MemoryRecord; score: number }> = [];
    const sorted = [...facts].sort((x, y) => Date.parse(y.createdAt) - Date.parse(x.createdAt));

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        const ta = `${a.text ?? ""} ${a.summaryL0 ?? ""}`;
        const tb = `${b.text ?? ""} ${b.summaryL0 ?? ""}`;
        const spoA = extractSPO(ta);
        const spoB = extractSPO(tb);

        if (spoA && spoB) {
          const subjSim = jaccardTokens(tokenize(spoA.subject), tokenize(spoB.subject));
          const predMatch = spoA.predicate === spoB.predicate;
          const objSim = jaccardTokens(tokenize(spoA.object), tokenize(spoB.object));
          if (subjSim >= 0.5 && predMatch && objSim < 0.3) {
            const score = Math.min(1, this.cfg.baseScore + 0.2 * subjSim + 0.15 * (1 - objSim));
            out.push({ a, b, score });
            continue;
          }
        }

        const taLow = ta.toLowerCase();
        const tbLow = tb.toLowerCase();
        const shared = a.entityIds.filter((e) => b.entityIds.includes(e));
        const negMismatch = NEGATION.test(taLow) !== NEGATION.test(tbLow);
        const wordOverlap =
          tokenize(taLow).filter((w) => w.length > 4 && tbLow.includes(w)).length;
        const topicOverlap = shared.length > 0 || wordOverlap >= 3;

        if (topicOverlap && negMismatch) {
          out.push({
            a,
            b,
            score: Math.min(1, this.cfg.baseScore + this.cfg.entityScoreBoost * shared.length),
          });
        }
      }
    }
    return out;
  }

  resolvePair(a: MemoryRecord, b: MemoryRecord): ContradictionResolution {
    const ca = typeof a.confidence === "number" ? a.confidence : this.cfg.defaultConfidence;
    const cb = typeof b.confidence === "number" ? b.confidence : this.cfg.defaultConfidence;
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);

    const spoA = extractSPO(`${a.text ?? ""} ${a.summaryL0 ?? ""}`);
    const spoB = extractSPO(`${b.text ?? ""} ${b.summaryL0 ?? ""}`);
    if (spoA && spoB) {
      const subjSim = jaccardTokens(tokenize(spoA.subject), tokenize(spoB.subject));
      if (subjSim >= 0.5 && spoA.predicate === spoB.predicate) {
        return ta >= tb
          ? { winnerId: a.id, loserId: b.id, reason: "spo_semantic_conflict" }
          : { winnerId: b.id, loserId: a.id, reason: "spo_semantic_conflict" };
      }
    }

    if (ca === cb) {
      return ta >= tb
        ? { winnerId: a.id, loserId: b.id, reason: "higher_recency_tie_break" }
        : { winnerId: b.id, loserId: a.id, reason: "higher_recency_tie_break" };
    }
    return ca > cb
      ? { winnerId: a.id, loserId: b.id, reason: "higher_source_confidence" }
      : { winnerId: b.id, loserId: a.id, reason: "higher_source_confidence" };
  }
}
