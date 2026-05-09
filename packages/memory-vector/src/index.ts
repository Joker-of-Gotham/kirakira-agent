export type * from "./types.js";

export {
  createQdrantClientWrapper,
  createVectorAdapter,
  type PgVectorAdapterFactoryConfig,
  type QdrantAdapterFactoryConfig,
  type VectorAdapterFactoryConfig,
  type VectorStoreBackend,
} from "./adapter-factory.js";
export type { QdrantClient } from "./adapter-factory.js";

export {
  QDRANT_DENSE_VECTOR,
  QDRANT_SPARSE_VECTOR,
  QdrantClientWrapper,
} from "./qdrant/client.js";
export { MEMORY_PAYLOAD_INDEXES } from "./qdrant/payload-schema.js";
export { QdrantCollectionManager } from "./qdrant/collection-manager.js";
export {
  QdrantSearchService,
  buildMemorySearchFilter,
} from "./qdrant/search.js";
export { QdrantUpsertService } from "./qdrant/upsert.js";
export { QdrantSnapshotService } from "./qdrant/snapshot.js";
export { QdrantAdapter } from "./qdrant/qdrant-adapter.js";

export { default as postgres, createPgVectorClient } from "./pgvector/client.js";
export {
  PgVectorTableManager,
  assertPgCollectionName,
} from "./pgvector/table-manager.js";
export { PgVectorSearchService } from "./pgvector/search.js";
export { PgVectorUpsertService } from "./pgvector/upsert.js";
export { PgVectorAdapter } from "./pgvector/pgvector-adapter.js";

export type { EmbeddingClient } from "./embedding/embedding-client.js";
export { BaseEmbeddingClient } from "./embedding/embedding-client.js";
export { BatchEmbedder, type BatchEmbedderOptions } from "./embedding/batch-embedder.js";
export {
  EMBEDDING_DIMENSIONS,
  getDimension,
} from "./embedding/dimension-config.js";
