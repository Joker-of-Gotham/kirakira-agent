import type {
  MemoryRecord,
  MemoryKind,
  RecallRoute,
  RecallRouteInput,
  RecallRouteResult,
  StoreAdapter,
  VectorAdapter,
} from "@kirakira/memory-core";
import type { RouteExplanation } from "@kirakira/memory-core";
import { MEMORY_COLLECTIONS } from "@kirakira/memory-core";

import { RRF_K, reciprocalRankFusion } from "../fusion/route-fusion.js";

const KIND_TO_COLLECTION: Record<string, string> = {
  episode: MEMORY_COLLECTIONS.episodeDense,
  fact: MEMORY_COLLECTIONS.factDense,
  observation: MEMORY_COLLECTIONS.observationDense,
  artifact_meta: MEMORY_COLLECTIONS.artifactDense,
  checkpoint: MEMORY_COLLECTIONS.checkpointDense,
};

function collectionsForKinds(kinds?: MemoryKind[]): string[] {
  if (!kinds || kinds.length === 0) {
    return [MEMORY_COLLECTIONS.factDense, MEMORY_COLLECTIONS.observationDense, MEMORY_COLLECTIONS.episodeDense];
  }
  const cols = new Set<string>();
  for (const k of kinds) {
    const c = KIND_TO_COLLECTION[k];
    if (c) cols.add(c);
  }
  return cols.size > 0 ? [...cols] : [MEMORY_COLLECTIONS.hybrid];
}

function simpleSparseFromText(text: string, vocabLimit = 8192): { indices: number[]; values: number[] } {
  const tokens = text.toLowerCase().split(/\W+/u).filter((t) => t.length > 2);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const indices: number[] = [];
  const values: number[] = [];
  for (const [word, c] of freq) {
    let h = 0;
    for (let i = 0; i < word.length; i++) {
      h = (h * 31 + word.charCodeAt(i)) % vocabLimit;
    }
    indices.push(h);
    values.push(Math.sqrt(c));
  }
  return { indices, values };
}

export class SimilarityRecallRoute implements RecallRoute {
  readonly name = "similarity";
  constructor(
    readonly weight: number,
    private readonly vector: VectorAdapter,
    private readonly store: StoreAdapter,
  ) {}

  async execute(input: RecallRouteInput): Promise<RecallRouteResult> {
    const start = performance.now();
    if (!input.embedding || input.embedding.length === 0) {
      const explanation: RouteExplanation = {
        routeName: this.name,
        candidates: [],
        filters: { reason: "no_embedding" },
        durationMs: performance.now() - start,
      };
      return { records: [], explanation };
    }

    const filter: Record<string, unknown> = {
      tenant_id: input.tenantId,
    };
    if (input.entityIds.length > 0) {
      filter["entity_ids"] = input.entityIds;
    }

    const collections = collectionsForKinds(input.kinds);
    const sparse = simpleSparseFromText(input.normalizedQuery);
    const emb = input.embedding!;

    const allSparse: Array<{ sourceRecordId: string; score: number }> = [];
    const allDense: Array<{ sourceRecordId: string; score: number }> = [];

    await Promise.all(
      collections.map(async (col) => {
        const [sp, dn] = await Promise.all([
          this.vector.search(col, {
            denseVector: emb,
            sparseIndices: sparse.indices,
            sparseValues: sparse.values,
            filter,
            limit: input.limit,
          }),
          this.vector.search(col, {
            denseVector: emb,
            filter,
            limit: input.limit,
          }),
        ]);
        allSparse.push(...sp);
        allDense.push(...dn);
      }),
    );

    const withSparse = allSparse;
    const denseResults = allDense;

    const rankedSparse = withSparse.map((r, i) => ({ id: r.sourceRecordId, rank: i + 1 }));
    const rankedDense = denseResults.map((r, i) => ({ id: r.sourceRecordId, rank: i + 1 }));
    const fused = reciprocalRankFusion(
      [
        { listId: `${this.name}:hybrid`, weight: this.weight, rankedIds: rankedSparse },
        { listId: `${this.name}:dense`, weight: this.weight * 0.85, rankedIds: rankedDense },
      ],
      RRF_K,
    ).slice(0, input.limit);

    const scoreById = new Map(fused.map((f) => [f.id, f.score] as const));
    const records: Array<{ record: MemoryRecord; score: number }> = [];
    for (const { id } of fused) {
      const rec = await this.store.getRecord(id);
      if (rec) {
        records.push({ record: rec, score: scoreById.get(id) ?? 0 });
      }
    }

    const explanation: RouteExplanation = {
      routeName: this.name,
      candidates: fused.slice(0, 20).map((c, i) => ({
        recordId: c.id,
        score: c.score,
        rank: i + 1,
      })),
      filters: filter,
      durationMs: performance.now() - start,
    };

    return { records, explanation };
  }
}
