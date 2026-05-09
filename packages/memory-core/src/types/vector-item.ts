export interface VectorItem {
  id: string;
  collection: string;
  sourceRecordId: string;
  denseVector?: number[];
  sparseIndices?: number[];
  sparseValues?: number[];
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface VectorSearchResult {
  id: string;
  sourceRecordId: string;
  score: number;
  payload: Record<string, unknown>;
}

export interface HybridSearchParams {
  denseVector: number[];
  sparseIndices?: number[];
  sparseValues?: number[];
  filter?: Record<string, unknown>;
  limit: number;
  scoreThreshold?: number;
}
