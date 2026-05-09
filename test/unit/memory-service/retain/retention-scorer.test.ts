import { describe, expect, it } from "vitest";

import { RetentionScorer } from "../../../../packages/memory-service/src/retain/retention-scorer.js";
import { makeRecord } from "../_helpers.js";

describe("RetentionScorer.predictRetainScore", () => {
  const scorer = new RetentionScorer();
  const importance = 0.5;

  it("returns a value in [0, 1]", () => {
    const s = scorer.predictRetainScore([], "hello world", 0.33);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it("treats empty recent records as maximal novelty", () => {
    const s = scorer.predictRetainScore(
      [],
      "alpha bravo charlie delta echo foxtrot golf hotel india",
      importance,
    );
    expect(s).toBe(0.775);
  });

  it("reduces score when new content overlaps heavily with recent memory text", () => {
    const duplicate = "alpha bravo charlie delta echo foxtrot golf hotel india";
    const recent = [
      makeRecord({
        summaryL0: duplicate,
        text: duplicate,
      }),
    ];
    const novelScore = scorer.predictRetainScore([], duplicate, importance);
    const dupScore = scorer.predictRetainScore(recent, duplicate, importance);
    expect(dupScore).toBeLessThan(novelScore);
  });

  it("uses 55% novelty and 45% classifier importance", () => {
    const content = "unique zebras quietly jump over vexing hills";
    const noveltyOnly = scorer.predictRetainScore(
      [makeRecord({ text: "something completely different".repeat(5), summaryL0: "other" })],
      content,
      0,
    );
    const importanceOnly = scorer.predictRetainScore([], content, 1);
    expect(noveltyOnly).toBeCloseTo(0.55 * 1 + 0.45 * 0, 4);
    expect(importanceOnly).toBeCloseTo(0.55 * 1 + 0.45 * 1, 4);
  });
});
