import { describe, expect, it } from "vitest";

import { ConsolidationScheduler } from "../../../../packages/memory-service/src/reflect/consolidation-scheduler.js";

describe("ConsolidationScheduler", () => {
  const scheduler = new ConsolidationScheduler();
  const freshIso = "2026-05-06T12:00:00.000Z";

  it("refuses consolidation for tiny groups", () => {
    expect(scheduler.shouldConsolidate(1, 86_400_000, freshIso, Date.parse(freshIso) + 1000)).toBe(false);
  });

  it("forces consolidation once the group is large enough", () => {
    expect(scheduler.shouldConsolidate(5, 86_400_000, freshIso, Date.parse(freshIso) + 1000)).toBe(true);
  });

  it("consolidates pairs when data is stale regardless of small group size", () => {
    const now = Date.parse("2026-05-10T12:00:00.000Z");
    const old = "2026-05-01T12:00:00.000Z";
    expect(scheduler.shouldConsolidate(2, 60_000, old, now)).toBe(true);
  });

  it("waits when group is small but still fresh", () => {
    const now = Date.parse("2026-05-06T13:00:00.000Z");
    expect(scheduler.shouldConsolidate(3, 3_600_000, freshIso, now)).toBe(false);
  });

  it("caps maxGroupsPerRun at 256 and defaults to 32", () => {
    expect(scheduler.maxGroupsPerRun(undefined)).toBe(32);
    expect(scheduler.maxGroupsPerRun(500)).toBe(256);
    expect(scheduler.maxGroupsPerRun(8)).toBe(8);
  });
});
