import postgres from "postgres";
import type { VectorSearchResult } from "@kirakira/memory-core";
import type { MemoryVectorFilter } from "../types.js";
import { assertPgCollectionName } from "./table-manager.js";

function toVectorLiteral(values: number[]): string {
  return `[${values.map((v) => Number(v)).join(",")}]`;
}

export class PgVectorSearchService {
  constructor(
    private readonly sql: ReturnType<typeof postgres>,
  ) {}

  async search(
    tableName: string,
    vector: number[],
    filter: MemoryVectorFilter | undefined,
    limit: number,
  ): Promise<VectorSearchResult[]> {
    const name = assertPgCollectionName(tableName);
    const lit = toVectorLiteral(vector);

    const tomb =
      "coalesce((payload->>'tombstoned')::boolean, false) IS NOT TRUE";

    if (filter === undefined) {
      const rows = await this.sql.unsafe(
        `
        SELECT id::text AS id,
               source_record_id::text AS source_record_id,
               payload,
               (1 - (embedding <=> $1::vector))::float AS score
        FROM "${name}"
        WHERE ${tomb}
        ORDER BY embedding <=> $1::vector
        LIMIT $2
        `,
        [lit, limit],
      );
      return mapRows(rows as Iterable<PgSearchRow>);
    }

    if (filter.entity_ids !== undefined && filter.entity_ids.length > 0) {
      const rows = await this.sql.unsafe(
        `
        SELECT id::text AS id,
               source_record_id::text AS source_record_id,
               payload,
               (1 - (embedding <=> $1::vector))::float AS score
        FROM "${name}"
        WHERE ${tomb}
          AND payload->>'tenant_id' = $2
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(coalesce(payload->'entity_ids', '[]'::jsonb)) AS e(val)
            WHERE val = ANY($3::text[])
          )
        ORDER BY embedding <=> $1::vector
        LIMIT $4
        `,
        [lit, filter.tenant_id, filter.entity_ids, limit],
      );
      return mapRows(rows as Iterable<PgSearchRow>);
    }

    const rows = await this.sql.unsafe(
      `
      SELECT id::text AS id,
             source_record_id::text AS source_record_id,
             payload,
             (1 - (embedding <=> $1::vector))::float AS score
      FROM "${name}"
      WHERE ${tomb}
        AND payload->>'tenant_id' = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
      `,
      [lit, filter.tenant_id, limit],
    );
    return mapRows(rows as Iterable<PgSearchRow>);
  }
}

type PgSearchRow = {
  id: string;
  source_record_id: string;
  payload: unknown;
  score: number;
};

function mapRows(rows: Iterable<PgSearchRow>): VectorSearchResult[] {
  return Array.from(rows, (r) => ({
    id: r.id,
    sourceRecordId: r.source_record_id,
    score: r.score,
    payload:
      typeof r.payload === "object" &&
      r.payload !== null &&
      !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : {},
  }));
}
