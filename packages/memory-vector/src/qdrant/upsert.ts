import type { VectorUpsertItem } from "@kirakira/memory-core";
import type { QdrantClient } from "@qdrant/js-client-rest";
import {
  QDRANT_DENSE_VECTOR,
  QDRANT_SPARSE_VECTOR,
} from "./client.js";

export class QdrantUpsertService {
  constructor(private readonly client: QdrantClient) {}

  async upsert(collection: string, items: VectorUpsertItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const points = items.map((item) => {
      const vector: Record<string, unknown> = {
        [QDRANT_DENSE_VECTOR]: item.denseVector,
      };
      if (
        item.sparseIndices !== undefined &&
        item.sparseValues !== undefined &&
        item.sparseIndices.length > 0
      ) {
        vector[QDRANT_SPARSE_VECTOR] = {
          indices: item.sparseIndices,
          values: item.sparseValues,
        };
      }

      return {
        id: item.id,
        vector,
        payload: {
          ...item.payload,
          source_record_id: item.sourceRecordId,
        },
      };
    });

    await this.client.upsert(collection, {
      wait: true,
      points,
    } as Parameters<QdrantClient["upsert"]>[1]);
  }

  async upsertBatch(
    collection: string,
    items: VectorUpsertItem[],
    batchSize: number,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await this.upsert(collection, batch);
    }
  }
}
