import type { VectorSearchResult, HybridSearchParams } from "../types/vector-item.js";

export interface VectorUpsertItem {
  id: string;
  sourceRecordId: string;
  denseVector: number[];
  sparseIndices?: number[];
  sparseValues?: number[];
  payload: Record<string, unknown>;
}

export interface VectorDeleteFilter {
  ids?: string[];
  sourceRecordIds?: string[];
  filter?: Record<string, unknown>;
}

export interface VectorAdapter {
  ensureCollection(name: string, dimension: number, hasSparse?: boolean): Promise<void>;
  deleteCollection(name: string): Promise<void>;
  listCollections(): Promise<string[]>;

  upsert(collection: string, items: VectorUpsertItem[]): Promise<void>;
  search(collection: string, params: HybridSearchParams): Promise<VectorSearchResult[]>;
  delete(collection: string, filter: VectorDeleteFilter): Promise<number>;

  createSnapshot(collection: string): Promise<string>;
  close(): Promise<void>;
}
