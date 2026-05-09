import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecallRequest } from "@kirakira/memory-core";

import { planRecallQuery } from "../../../../packages/memory-service/src/recall/query-planner.js";

describe("planRecallQuery", () => {
  const baseReq = (): RecallRequest => ({
    tenantId: "t1",
    workspaceId: "w1",
    query: " What did Contoso agree on? ",
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes query to lowercase trimmed text", () => {
    const plan = planRecallQuery(baseReq(), { tokenBudget: 8192 });
    expect(plan.normalizedQuery).toBe("what did contoso agree on?");
  });

  it("merges explicit entityIds with capitalized and quoted spans from the raw query", () => {
    const plan = planRecallQuery(
      {
        ...baseReq(),
        query: 'Follow up with Sarah Chen about "data residency"',
        entityIds: ["ent-1"],
      },
      { tokenBudget: 8192 },
    );
    expect(plan.entityReferences).toEqual(
      expect.arrayContaining(["ent-1", "Sarah Chen", "data residency"]),
    );
  });

  it("infers a day-bounded window for yesterday phrasing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T15:30:00.000Z"));
    const plan = planRecallQuery({ ...baseReq(), query: "Show checkpoints from yesterday" }, { tokenBudget: 8192 });
    expect(plan.timeWindow).toEqual({
      from: "2026-05-05T00:00:00.000Z",
      to: "2026-05-06T15:30:00.000Z",
    });
  });

  it("maps past 7 days to a week-long window ending at now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const plan = planRecallQuery({ ...baseReq(), query: "Errors in the past 7 days" }, { tokenBudget: 8192 });
    expect(plan.timeWindow).toBeDefined();
    const spanDays =
      (Date.parse(plan.timeWindow!.to!) - Date.parse(plan.timeWindow!.from!)) / 86_400_000;
    expect(spanDays).toBeCloseTo(7, 0);
  });

  it("parses quarter windows such as Q1 2026", () => {
    const plan = planRecallQuery({ ...baseReq(), query: "Revenue for Q1 2026" }, { tokenBudget: 8192 });
    expect(plan.timeWindow).toEqual({
      from: new Date(Date.UTC(2026, 0, 1)).toISOString(),
      to: new Date(Date.UTC(2026, 3, 1)).toISOString(),
    });
  });

  it("drops temporal route when no explicit or inferred time window exists", () => {
    const plan = planRecallQuery({ ...baseReq(), query: "generic capability question" }, { tokenBudget: 8192 });
    expect(plan.timeWindow).toBeUndefined();
    expect(plan.activeRoutes).not.toContain("temporal");
  });

  it("drops state route without ids or state keywords in the query", () => {
    const plan = planRecallQuery({ ...baseReq(), query: "pricing guidance" }, { tokenBudget: 8192 });
    expect(plan.activeRoutes).not.toContain("state");
  });

  it("keeps state route when runId is provided", () => {
    const plan = planRecallQuery(
      { ...baseReq(), query: "pricing guidance", runId: "run-9" },
      { tokenBudget: 8192 },
    );
    expect(plan.activeRoutes).toContain("state");
  });

  it("scales perRouteLimit with tokenBudget via the shared base factor", () => {
    const low = planRecallQuery({ ...baseReq(), query: "static" }, { tokenBudget: 2048 });
    const high = planRecallQuery({ ...baseReq(), query: "static" }, { tokenBudget: 8192 });
    expect(high.perRouteLimit.similarity).toBeGreaterThan(low.perRouteLimit.similarity);
    expect(high.tokenBudget).toBe(8192);
    expect(low.tokenBudget).toBe(2048);
  });
});
