import type {
  HybridSearchParams,
  VectorSearchResult,
} from "@kirakira/memory-core";

export type { HybridSearchParams, VectorSearchResult };

/** Qdrant / search result row with optional source id in payload */
export interface ScoredPoint {
  id: string;
  score: number;
  payload: Record<string, unknown>;
  sourceRecordId: string;
}

export interface SearchOptions {
  scoreThreshold?: number;
  withPayload?: boolean;
  withVector?: boolean;
}

/**
 * Structured filter for memory vector search.
 * Maps to Qdrant must / should / must_not clauses.
 */
export interface MemoryVectorFilter {
  tenant_id: string;
  entity_ids?: string[];
}
