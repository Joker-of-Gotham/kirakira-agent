import { describe, expect, it } from "vitest";

import { BudgetCompiler } from "../../../../packages/memory-service/src/recall/budget/budget-compiler.js";
import { makeRecord } from "../_helpers.js";

describe("BudgetCompiler.compile", () => {
  const compiler = new BudgetCompiler();

  it("always materializes L0 with abstract and entityCount", async () => {
    const records = [
      makeRecord({ id: "a", entityIds: ["e1", "e2"], kind: "fact", text: "hello world" }),
    ];
    const { context } = await compiler.compile(records, "q-1", [], 5000, "L3");
    expect(context.levels.l0).toMatchObject({
      level: "L0",
      abstract: expect.stringContaining("q-1"),
      entityCount: 2,
    });
    expect(context.levels.l0!.abstract).toContain("2 entities");
    expect(context.totalEstimatedTokens).toBeGreaterThan(0);
  });

  it("includes L1 summaries when requested level is at least L1", async () => {
    const records = [makeRecord({ id: "f1", kind: "fact", text: "long fact ".repeat(5), summaryL0: "fact sum" })];
    const { context, effectiveLevel } = await compiler.compile(records, "q", [], 50_000, "L1");
    expect(effectiveLevel).toBe("L1");
    expect(context.levels.l1).toBeDefined();
    expect(context.levels.l1!.factSummaries.length).toBe(1);
    expect(context.levels.l2).toBeUndefined();
    expect(context.levels.l3).toBeUndefined();
  });

  it("adds L2 cards when level is L2 or higher and budget allows", async () => {
    const records = [makeRecord({ id: "c1", kind: "observation", text: "short observation body" })];
    const expl = [{ recordId: "c1", routeReason: "similarity", score: 0.8 }];
    const { context, effectiveLevel } = await compiler.compile(records, "q", expl, 50_000, "L2");
    expect(effectiveLevel).toBe("L2");
    expect(context.levels.l2?.cards[0]).toMatchObject({
      id: "c1",
      routeReason: "similarity",
      score: 0.8,
    });
    expect(context.levels.l3).toBeUndefined();
  });

  it("includes raw L3 evidence spans when staying at L3", async () => {
    const records = [
      makeRecord({
        id: "raw",
        kind: "fact",
        text: "evidence paragraph",
        metadata: { artifactUri: "s3://bucket/key" },
      }),
    ];
    const { context, effectiveLevel } = await compiler.compile(records, "q", [], 50_000, "L3");
    expect(effectiveLevel).toBe("L3");
    expect(context.levels.l3!.evidence[0]).toMatchObject({
      rawSpan: "evidence paragraph",
      artifactPointer: "s3://bucket/key",
    });
  });

  it("steps down through L3→L2→L1→L0 when estimated tokens exceed budget", async () => {
    const heavy = "word ".repeat(500);
    const records = [makeRecord({ id: "big", kind: "fact", text: heavy, summaryL0: heavy.slice(0, 200) })];
    const { context, effectiveLevel, degradationReason } = await compiler.compile(
      records,
      "q",
      [],
      5,
      "L3",
    );
    expect(effectiveLevel).toBe("L0");
    expect(degradationReason).toBe("budget_exceeded_downgrade_L3_to_L2");
    expect(context.levels.l3).toBeUndefined();
    expect(context.levels.l2).toBeUndefined();
    expect(context.levels.l1).toBeUndefined();
    expect(context.levels.l0).toBeDefined();
  });
});
