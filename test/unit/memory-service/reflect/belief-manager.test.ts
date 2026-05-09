import { describe, expect, it } from "vitest";

import { BeliefManager } from "../../../../packages/memory-service/src/reflect/belief-manager.js";
import { makeRecord } from "../_helpers.js";

describe("BeliefManager", () => {
  const mgr = new BeliefManager();
  const now = "2026-05-06T12:00:00.000Z";

  it("materializes beliefs from clustered facts", () => {
    const cluster = [
      makeRecord({ id: "f1", tenantId: "t1", workspaceId: "w1", text: "Fact one", confidence: 0.8, entityIds: ["e1"] }),
      makeRecord({ id: "f2", tenantId: "t1", workspaceId: "w1", text: "Fact two", confidence: 0.8, entityIds: ["e2"] }),
    ];
    const belief = mgr.createBeliefFromFacts(cluster, now);
    expect(belief.kind).toBe("belief");
    expect(belief.metadata).toMatchObject({ derivedFromFactIds: ["f1", "f2"] });
  });

  it("raises confidence with support count up to four bonus steps", () => {
    const two = mgr.createBeliefFromFacts(
      [
        makeRecord({ id: "a", text: "x", confidence: 0.5, tenantId: "t", workspaceId: "w" }),
        makeRecord({ id: "b", text: "y", confidence: 0.5, tenantId: "t", workspaceId: "w" }),
      ],
      now,
    );
    const six = mgr.createBeliefFromFacts(
      Array.from({ length: 6 }, (_, i) =>
        makeRecord({ id: `f${i}`, text: `t${i}`, confidence: 0.5, tenantId: "t", workspaceId: "w" }),
      ),
      now,
    );
    expect(six.confidence).toBeGreaterThan(two.confidence!);
    expect(six.confidence).toBeLessThanOrEqual(1);
  });

  it("unions entity identifiers from supporting facts", () => {
    const belief = mgr.createBeliefFromFacts(
      [
        makeRecord({ id: "1", text: "a", tenantId: "t", workspaceId: "w", entityIds: ["alpha"] }),
        makeRecord({ id: "2", text: "b", tenantId: "t", workspaceId: "w", entityIds: ["beta", "alpha"] }),
      ],
      now,
    );
    expect(belief.entityIds.sort()).toEqual(["alpha", "beta"].sort());
  });

  it("adjusts confidence upward on supporting evidence and downward on refutations", () => {
    const belief = makeRecord({
      id: "b1",
      kind: "belief",
      text: "summary",
      confidence: 0.6,
      tenantId: "t",
      workspaceId: "w",
    });
    const up = mgr.adjustConfidenceForEvidence(belief, 2, 0, now);
    const down = mgr.adjustConfidenceForEvidence(belief, 0, 2, now);
    expect(up.confidence).toBeGreaterThan(belief.confidence!);
    expect(down.confidence).toBeLessThan(belief.confidence!);
  });

  it("clamps adjusted confidence within [0.05, 0.99]", () => {
    const hi = makeRecord({
      id: "hi",
      kind: "belief",
      confidence: 0.98,
      tenantId: "t",
      workspaceId: "w",
    });
    const lo = makeRecord({
      id: "lo",
      kind: "belief",
      confidence: 0.06,
      tenantId: "t",
      workspaceId: "w",
    });
    expect(mgr.adjustConfidenceForEvidence(hi, 10, 0, now).confidence).toBe(0.99);
    expect(mgr.adjustConfidenceForEvidence(lo, 0, 10, now).confidence).toBe(0.05);
  });
});
