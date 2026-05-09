import { describe, expect, it } from "vitest";

import {
  RRF_K,
  fuseRouteResults,
  reciprocalRankFusion,
} from "../../../../packages/memory-service/src/recall/fusion/route-fusion.js";

describe("reciprocalRankFusion", () => {
  it("preserves relative ranking for a single weighted list", () => {
    const out = reciprocalRankFusion([
      {
        listId: "a",
        weight: 1,
        rankedIds: [
          { id: "first", rank: 1 },
          { id: "second", rank: 2 },
        ],
      },
    ]);
    expect(out.map((x) => x.id)).toEqual(["first", "second"]);
  });

  it("promotes ids that appear near the top of multiple lists", () => {
    const out = reciprocalRankFusion([
      {
        listId: "x",
        weight: 1,
        rankedIds: [
          { id: "a", rank: 1 },
          { id: "b", rank: 2 },
        ],
      },
      {
        listId: "y",
        weight: 1,
        rankedIds: [
          { id: "a", rank: 1 },
          { id: "c", rank: 2 },
        ],
      },
    ]);
    expect(out[0]!.id).toBe("a");
    expect(out.map((e) => e.id)).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("increases contribution when list weight is higher", () => {
    const lightFirst = reciprocalRankFusion([
      { listId: "w1", weight: 1, rankedIds: [{ id: "alpha", rank: 1 }] },
      { listId: "w2", weight: 1, rankedIds: [{ id: "beta", rank: 1 }] },
    ]);
    const heavySecond = reciprocalRankFusion([
      { listId: "w1", weight: 1, rankedIds: [{ id: "alpha", rank: 1 }] },
      { listId: "w2", weight: 2, rankedIds: [{ id: "beta", rank: 1 }] },
    ]);
    const betaLight = lightFirst.find((x) => x.id === "beta")!.score;
    const betaHeavy = heavySecond.find((x) => x.id === "beta")!.score;
    expect(betaHeavy).toBeGreaterThan(betaLight);
  });

  it("uses k to scale reciprocal rank contributions", () => {
    const smallK = reciprocalRankFusion(
      [{ listId: "a", weight: 1, rankedIds: [{ id: "only", rank: 1 }] }],
      10,
    );
    const largeK = reciprocalRankFusion(
      [{ listId: "a", weight: 1, rankedIds: [{ id: "only", rank: 1 }] }],
      RRF_K,
    );
    expect(smallK[0]!.score).toBeGreaterThan(largeK[0]!.score);
  });

  it("returns empty output for empty input", () => {
    expect(reciprocalRankFusion([])).toEqual([]);
  });
});

describe("fuseRouteResults", () => {
  it("delegates to reciprocalRankFusion with the provided k", () => {
    const fused = fuseRouteResults(
      [
        { routeName: "similarity", weight: 1, rankedIds: [{ id: "r1", rank: 1 }] },
        { routeName: "graph", weight: 1, rankedIds: [{ id: "r2", rank: 2 }] },
      ],
      30,
    );
    expect(fused.length).toBeGreaterThan(0);
  });
});
