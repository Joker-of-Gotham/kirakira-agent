import type { VectorSearchResult } from "@kirakira/memory-core";
import type { QdrantClient } from "@qdrant/js-client-rest";
import type { MemoryVectorFilter } from "../types.js";
import {
  QDRANT_DENSE_VECTOR,
  QDRANT_SPARSE_VECTOR,
} from "./client.js";

type SearchFilter = NonNullable<
  Parameters<QdrantClient["search"]>[1]
>["filter"];

function asFilter(part: {
  must?: unknown[];
  should?: unknown[];
  must_not?: unknown[];
  min_should?: unknown;
}): SearchFilter {
  return part as SearchFilter;
}

function normalizeClauses(
  side: SearchFilter | undefined,
  key: "must" | "should" | "must_not",
): unknown[] {
  const v = side?.[key];
  if (v === undefined || v === null) {
    return [];
  }
  if (Array.isArray(v)) {
    return [...v];
  }
  return [v];
}

export function buildMemorySearchFilter(
  base: MemoryVectorFilter,
  extra?: SearchFilter,
): SearchFilter {
  const must: unknown[] = [
    {
      key: "tenant_id",
      match: { value: base.tenant_id },
    },
  ];

  const should: unknown[] = [];
  if (base.entity_ids !== undefined && base.entity_ids.length > 0) {
    should.push({
      key: "entity_ids",
      match: { any: base.entity_ids },
    });
  }

  const must_not: unknown[] = [
    {
      key: "tombstoned",
      match: { value: true },
    },
  ];

  const filter = asFilter({
    must,
    ...(should.length > 0 ? { should } : {}),
    must_not,
  });

  if (!extra) {
    return filter;
  }

  return mergeFilters(filter, extra);
}

function mergeFilters(a: SearchFilter, b: SearchFilter): SearchFilter {
  const must = [...normalizeClauses(a, "must"), ...normalizeClauses(b, "must")];
  const should = [
    ...normalizeClauses(a, "should"),
    ...normalizeClauses(b, "should"),
  ];
  const must_not = [
    ...normalizeClauses(a, "must_not"),
    ...normalizeClauses(b, "must_not"),
  ];

  const minA = (a as { min_should?: unknown }).min_should;
  const minB = (b as { min_should?: unknown }).min_should;

  return asFilter({
    ...(must.length > 0 ? { must } : {}),
    ...(should.length > 0 ? { should } : {}),
    ...(must_not.length > 0 ? { must_not } : {}),
    ...(minA !== undefined || minB !== undefined
      ? { min_should: minB !== undefined ? minB : minA }
      : {}),
  });
}

function pointToResult(row: {
  id: string | number;
  score: number;
  payload?: Record<string, unknown> | null;
}): VectorSearchResult {
  const payload = row.payload ?? {};
  const sid = payload["source_record_id"];
  return {
    id: String(row.id),
    sourceRecordId: typeof sid === "string" ? sid : String(sid ?? ""),
    score: row.score,
    payload,
  };
}

export class QdrantSearchService {
  constructor(private readonly client: QdrantClient) {}

  async denseSearch(
    collection: string,
    vector: number[],
    filter: MemoryVectorFilter,
    limit: number,
    extraFilter?: SearchFilter,
  ): Promise<VectorSearchResult[]> {
    const merged = buildMemorySearchFilter(filter, extraFilter);
    const rows = await this.client.search(collection, {
      vector: { name: QDRANT_DENSE_VECTOR, vector },
      filter: merged,
      limit,
      with_payload: true,
    });
    return rows.map(pointToResult);
  }

  async sparseSearch(
    collection: string,
    indices: number[],
    values: number[],
    filter: MemoryVectorFilter,
    limit: number,
    extraFilter?: SearchFilter,
  ): Promise<VectorSearchResult[]> {
    const merged = buildMemorySearchFilter(filter, extraFilter);
    const rows = await this.client.search(collection, {
      vector: {
        name: QDRANT_SPARSE_VECTOR,
        vector: { indices, values },
      },
      filter: merged,
      limit,
      with_payload: true,
    });
    return rows.map(pointToResult);
  }

  async hybridSearch(
    collection: string,
    denseVector: number[],
    sparseIndices: number[] | undefined,
    sparseValues: number[] | undefined,
    filter: MemoryVectorFilter,
    limit: number,
    extraFilter?: SearchFilter,
  ): Promise<VectorSearchResult[]> {
    if (
      sparseIndices === undefined ||
      sparseValues === undefined ||
      sparseIndices.length === 0
    ) {
      return this.denseSearch(
        collection,
        denseVector,
        filter,
        limit,
        extraFilter,
      );
    }

    const merged = buildMemorySearchFilter(filter, extraFilter);
    const prefetchLimit = Math.max(limit * 2, 20);

    const { points } = await this.client.query(collection, {
      prefetch: [
        {
          query: { nearest: denseVector },
          using: QDRANT_DENSE_VECTOR,
          limit: prefetchLimit,
          filter: merged,
        },
        {
          query: {
            nearest: { indices: sparseIndices, values: sparseValues },
          },
          using: QDRANT_SPARSE_VECTOR,
          limit: prefetchLimit,
          filter: merged,
        },
      ],
      query: { fusion: "rrf" },
      limit,
      with_payload: true,
    });

    return points.map(pointToResult);
  }
}
