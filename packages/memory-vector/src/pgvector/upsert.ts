import postgres from "postgres";
import type { VectorUpsertItem } from "@kirakira/memory-core";
import { assertPgCollectionName } from "./table-manager.js";

function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => Number(v)).join(",")}]`;
}

export class PgVectorUpsertService {
  constructor(
    private readonly sql: ReturnType<typeof postgres>,
  ) {}

  async upsert(tableName: string, items: VectorUpsertItem[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    const name = assertPgCollectionName(tableName);

    for (const item of items) {
      const lit = toVectorLiteral(item.denseVector);
      const payload = JSON.stringify({
        ...item.payload,
        source_record_id: item.sourceRecordId,
      });

      await this.sql.unsafe(
        `
        INSERT INTO "${name}" (id, source_record_id, embedding, payload)
        VALUES ($1, $2, $3::vector, $4::jsonb)
        ON CONFLICT (id) DO UPDATE SET
          source_record_id = EXCLUDED.source_record_id,
          embedding = EXCLUDED.embedding,
          payload = EXCLUDED.payload
        `,
        [item.id, item.sourceRecordId, lit, payload],
      );
    }
  }

  async upsertBatch(
    tableName: string,
    items: VectorUpsertItem[],
    batchSize: number,
  ): Promise<void> {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      await this.upsert(tableName, batch);
    }
  }
}
