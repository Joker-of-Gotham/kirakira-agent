import type { MemoryRecord } from "@kirakira/memory-core";

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/\W+/u)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Nemori-inspired novelty scoring: high when new content is **not** reconstructible from recent memory text.
 */
export class RetentionScorer {
  predictRetainScore(
    recentRecords: MemoryRecord[],
    newContent: string,
    classifierImportance: number,
  ): number {
    const corpus = recentRecords
      .map((r) => [r.summaryL0, r.overviewL1, r.text].filter(Boolean).join(" "))
      .join("\n");
    const novelTokens = tokenize(newContent);
    const memoryTokens = tokenize(corpus);
    const overlap = jaccard(novelTokens, memoryTokens);
    const novelty = 1 - overlap;
    const blended = 0.55 * novelty + 0.45 * classifierImportance;
    return Math.max(0, Math.min(1, Number(blended.toFixed(4))));
  }
}
