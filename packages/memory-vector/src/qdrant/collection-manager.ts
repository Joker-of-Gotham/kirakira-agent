import { MEMORY_COLLECTIONS, VectorAdapterError } from "@kirakira/memory-core";
import type { QdrantClient } from "@qdrant/js-client-rest";
import { MEMORY_PAYLOAD_INDEXES } from "./payload-schema.js";
import {
  QDRANT_DENSE_VECTOR,
  QDRANT_SPARSE_VECTOR,
} from "./client.js";

const ALLOWED_COLLECTIONS = new Set<string>(
  Object.values(MEMORY_COLLECTIONS) as string[],
);

export class QdrantCollectionManager {
  constructor(private readonly client: QdrantClient) {}

  async ensureCollection(
    name: string,
    dimension: number,
    hasSparse?: boolean,
  ): Promise<void> {
    if (!ALLOWED_COLLECTIONS.has(name)) {
      throw new VectorAdapterError(
        `Unknown collection "${name}". Use a name from MEMORY_COLLECTIONS.`,
      );
    }

    const exists = await this.client.collectionExists(name);
    if (exists.exists) {
      return;
    }

    await this.client.createCollection(name, {
      vectors: {
        [QDRANT_DENSE_VECTOR]: {
          size: dimension,
          distance: "Cosine",
        },
      },
      ...(hasSparse
        ? {
            sparse_vectors: {
              [QDRANT_SPARSE_VECTOR]: {},
            },
          }
        : {}),
      hnsw_config: { m: 16, ef_construct: 100 },
    });

    for (const idx of MEMORY_PAYLOAD_INDEXES) {
      await this.client.createPayloadIndex(name, {
        field_name: idx.field_name,
        field_schema: idx.field_schema,
        wait: true,
      });
    }
  }

  async deleteCollection(name: string): Promise<void> {
    await this.client.deleteCollection(name);
  }

  async listCollections(): Promise<string[]> {
    const { collections } = await this.client.getCollections();
    const names = collections.map((c) => c.name);
    return names.filter((n) => ALLOWED_COLLECTIONS.has(n));
  }
}
