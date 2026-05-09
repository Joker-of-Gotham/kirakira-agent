import { describe, expect, it } from "vitest";

import { ContradictionResolver } from "../../../../packages/memory-service/src/reflect/contradiction-resolver.js";
import { makeRecord } from "../_helpers.js";

describe("ContradictionResolver", () => {
  const resolver = new ContradictionResolver();

  it("flags contradictions when entities overlap and polarity differs", () => {
    const facts = [
      makeRecord({
        id: "older",
        text: "Gateway payments are not enabled for merchants in that region now",
        entityIds: ["merchant"],
        createdAt: "2026-05-01T12:00:00.000Z",
      }),
      makeRecord({
        id: "newer",
        text: "Gateway payments are enabled for merchants in that region now",
        entityIds: ["merchant"],
        createdAt: "2026-05-04T12:00:00.000Z",
      }),
    ];
    const pairs = resolver.detectContradictions(facts);
    expect(pairs.length).toBe(1);
    expect(pairs[0]!.a.id).toBe("newer");
    expect(pairs[0]!.b.id).toBe("older");
  });

  it("ignores facts that agree on negation usage", () => {
    const facts = [
      makeRecord({
        id: "a",
        text: "The feature is not ready for launch yet",
        entityIds: ["feature"],
        createdAt: "2026-05-01T12:00:00.000Z",
      }),
      makeRecord({
        id: "b",
        text: "The component is not ready for customers yet",
        entityIds: ["component"],
        createdAt: "2026-05-02T12:00:00.000Z",
      }),
    ];
    expect(resolver.detectContradictions(facts)).toHaveLength(0);
  });

  it("skips unrelated statements lacking topical or entity overlap", () => {
    const facts = [
      makeRecord({
        id: "alpha",
        text: "apple tree growth depends on rainfall patterns",
        entityIds: [],
        createdAt: "2026-05-01T12:00:00.000Z",
      }),
      makeRecord({
        id: "beta",
        text: "zebra migrations follow seasonal water sources",
        entityIds: [],
        createdAt: "2026-05-02T12:00:00.000Z",
      }),
    ];
    expect(resolver.detectContradictions(facts)).toHaveLength(0);
  });

  it("prefers higher-confidence facts when resolving a pair", () => {
    const winner = makeRecord({ id: "w", confidence: 0.95, createdAt: "2026-05-01T12:00:00.000Z" });
    const loser = makeRecord({ id: "l", confidence: 0.4, createdAt: "2026-05-06T12:00:00.000Z" });
    const res = resolver.resolvePair(winner, loser);
    expect(res.winnerId).toBe("w");
    expect(res.reason).toBe("higher_source_confidence");
  });

  it("breaks ties using recency when confidence matches", () => {
    const recent = makeRecord({ id: "recent", confidence: 0.8, createdAt: "2026-05-10T12:00:00.000Z" });
    const older = makeRecord({ id: "older", confidence: 0.8, createdAt: "2026-05-01T12:00:00.000Z" });
    expect(resolver.resolvePair(recent, older).winnerId).toBe("recent");
    expect(resolver.resolvePair(older, recent).winnerId).toBe("recent");
  });
});
