import { describe, expect, it } from "vitest";

import { retrievalTraceSchema } from "@kirakira/memory-core";

describe("retrieval trace contract", () => {
  it("parses traces emitted by RecallPipeline", () => {
    const trace = retrievalTraceSchema.parse({
      traceId: "01HZQB5XK9DZRXC0QVTG4M5K9Q",
      queryId: "01HZQB5XK9DZRXC0QVTG4N5K9Q",
      normalizedQuery: "billing debate",
      routePlan: ["similarity", "graph"],
      routes: [
        {
          routeName: "similarity",
          candidates: [{ recordId: "550e8400-e29b-41d4-a716-446655440000", score: 0.9, rank: 1 }],
          filters: { tenant_id: "t1" },
          durationMs: 12.5,
        },
      ],
      fusionScores: [{ recordId: "550e8400-e29b-41d4-a716-446655440000", score: 0.8, selected: true }],
      rerankScores: [{ recordId: "550e8400-e29b-41d4-a716-446655440000", score: 0.77, reason: "coverage" }],
      budgetLevel: "L2",
      budgetDegradationReason: undefined,
      totalDurationMs: 42,
      createdAt: "2026-05-06T12:00:00.000Z",
    });

    expect(trace.budgetLevel).toBe("L2");
    expect(trace.routes[0]?.routeName).toBe("similarity");
  });
});
