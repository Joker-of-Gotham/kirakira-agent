/** RRF constant `k` (standard default 60). */
export const RRF_K = 60;

export interface WeightedRankedList {
  readonly listId: string;
  readonly weight: number;
  readonly rankedIds: readonly { readonly id: string; readonly rank: number }[];
}

export function reciprocalRankFusion(
  lists: WeightedRankedList[],
  k = RRF_K,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of lists) {
    for (const { id, rank } of list.rankedIds) {
      const inc = (list.weight * 1) / (k + rank);
      scores.set(id, (scores.get(id) ?? 0) + inc);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}

export function fuseRouteResults(
  routeLists: Array<{ routeName: string; weight: number; rankedIds: { id: string; rank: number }[] }>,
  k = RRF_K,
): Array<{ id: string; score: number }> {
  return reciprocalRankFusion(
    routeLists.map((r) => ({
      listId: r.routeName,
      weight: r.weight,
      rankedIds: r.rankedIds,
    })),
    k,
  );
}
