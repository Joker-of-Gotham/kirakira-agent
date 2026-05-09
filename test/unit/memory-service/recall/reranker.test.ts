import { describe, expect, it } from "vitest";

import { RetrievalReranker } from "../../../../packages/memory-service/src/recall/fusion/reranker.js";
import { makeRecord } from "../_helpers.js";

describe("RetrievalReranker.rerank", () => {
  const reranker = new RetrievalReranker();

  it("returns every input record once", () => {
    const r1 = makeRecord({ id: "x", text: "quantum research laboratory findings" });
    const r2 = makeRecord({ id: "y", text: "oceanography tide predictions for april" });
    const out = reranker.rerank(
      [
        { record: r1, score: 0.5 },
        { record: r2, score: 0.4 },
      ],
      { coverageBonusWeight: 0, redundancyPenaltyWeight: 0 },
    );
    expect(out.map((o) => o.record.id).sort()).toEqual(["x", "y"].sort());
  });

  it("keeps higher fusion records ahead when bonuses and penalties are neutralized", () => {
    const high = makeRecord({ id: "hi", text: "aaa bbb ccc ddd" });
    const low = makeRecord({ id: "lo", text: "www xxx yyy zzz" });
    const out = reranker.rerank(
      [
        { record: low, score: 0.2 },
        { record: high, score: 0.9 },
      ],
      { coverageBonusWeight: 0, redundancyPenaltyWeight: 0 },
    );
    expect(out[0]!.record.id).toBe("hi");
  });

  it("adds coverage bonus when a record widens entity coverage", () => {
    const dense = makeRecord({ id: "dense", text: "shared token vocabulary here", entityIds: ["e1"] });
    const novel = makeRecord({ id: "novel", text: "totally different vocabulary zebras", entityIds: ["e2"] });
    const fused = [
      { record: dense, score: 0.5 },
      { record: novel, score: 0.65 },
    ];
    const out = reranker.rerank(fused, { coverageBonusWeight: 1, redundancyPenaltyWeight: 0 });
    expect(out.find((o) => o.record.id === "novel")!.score).toBeGreaterThan(
      out.find((o) => o.record.id === "dense")!.score,
    );
  });

  it("applies redundancy penalty for lexically similar records", () => {
    const text =
      "the quick brown fox jumps over the lazy dog near the river bank every morning without fail";
    const a = makeRecord({ id: "a", text, summaryL0: text.slice(0, 40) });
    const b = makeRecord({ id: "b", text, summaryL0: text.slice(0, 40) });
    const out = reranker.rerank(
      [
        { record: a, score: 0.55 },
        { record: b, score: 0.55 },
      ],
      { coverageBonusWeight: 0, redundancyPenaltyWeight: 1 },
    );
    expect(out[0]!.record.id).toBe("a");
    expect(out[1]!.score).toBeLessThan(out[0]!.score);
  });

  it("boosts scores using cross-encoder values", () => {
    const r1 = makeRecord({ id: "ce-low", text: "alpha beta gamma" });
    const r2 = makeRecord({ id: "ce-high", text: "delta epsilon zeta" });
    const cross = new Map<string, number>([
      ["ce-low", 0.1],
      ["ce-high", 0.9],
    ]);
    const out = reranker.rerank(
      [
        { record: r1, score: 0.5 },
        { record: r2, score: 0.5 },
      ],
      { crossEncoder: cross, coverageBonusWeight: 0, redundancyPenaltyWeight: 0 },
    );
    expect(out[0]!.record.id).toBe("ce-high");
  });

  it("sorts results by adjusted score descending", () => {
    const rows = [
      makeRecord({ id: "r1", text: "one two three" }),
      makeRecord({ id: "r2", text: "four five six" }),
      makeRecord({ id: "r3", text: "seven eight nine" }),
    ];
    const out = reranker.rerank(
      rows.map((record, i) => ({ record, score: 0.4 + i * 0.05 })),
      { coverageBonusWeight: 0, redundancyPenaltyWeight: 0 },
    );
    for (let i = 0; i < out.length - 1; i++) {
      expect(out[i]!.score).toBeGreaterThanOrEqual(out[i + 1]!.score);
    }
  });
});
