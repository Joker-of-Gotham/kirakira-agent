import postgres from "postgres";
import type {
  HybridSearchParams,
  VectorAdapter,
  VectorDeleteFilter,
  VectorSearchResult,
  VectorUpsertItem,
} from "@kirakira/memory-core";
import { VectorAdapterError } from "@kirakira/memory-core";
import type { MemoryVectorFilter } from "../types.js";
import { assertPgCollectionName } from "./table-manager.js";
import { PgVectorSearchService } from "./search.js";
import { PgVectorTableManager } from "./table-manager.js";
import { PgVectorUpsertService } from "./upsert.js";

function parseMemoryFilter(
  raw: Record<string, unknown> | undefined,
): MemoryVectorFilter {
  const tenant = raw?.["tenant_id"];
  if (typeof tenant !== "string" || tenant.length === 0) {
    throw new VectorAdapterError(
      "Vector search filter must include string tenant_id",
    );
  }
  const eids = raw?.["entity_ids"];
  const entity_ids = Array.isArray(eids)
    ? eids.filter((x): x is string => typeof x === "string")
    : undefined;

  return { tenant_id: tenant, entity_ids };
}

export class PgVectorAdapter implements VectorAdapter {
  private readonly sql: ReturnType<typeof postgres>;
  private readonly tables: PgVectorTableManager;
  private readonly searchSvc: PgVectorSearchService;
  private readonly upsertSvc: PgVectorUpsertService;

  constructor(sql: ReturnType<typeof postgres>) {
    this.sql = sql;
    this.tables = new PgVectorTableManager(sql);
    this.searchSvc = new PgVectorSearchService(sql);
    this.upsertSvc = new PgVectorUpsertService(sql);
  }

  ensureCollection(
    name: string,
    dimension: number,
    _hasSparse?: boolean,
  ): Promise<void> {
    return this.tables.ensureTable(name, dimension);
  }

  deleteCollection(name: string): Promise<void> {
    return this.tables.dropTable(name);
  }

  listCollections(): Promise<string[]> {
    return this.tables.listTables();
  }

  upsert(collection: string, items: VectorUpsertItem[]): Promise<void> {
    return this.upsertSvc.upsert(collection, items);
  }

  search(
    collection: string,
    params: HybridSearchParams,
  ): Promise<VectorSearchResult[]> {
    const base = parseMemoryFilter(params.filter);
    return this.searchSvc.search(
      collection,
      params.denseVector,
      base,
      params.limit,
    );
  }

  async delete(
    collection: string,
    spec: VectorDeleteFilter,
  ): Promise<number> {
    const name = assertPgCollectionName(collection);
    const q = `"${name.replaceAll('"', '""')}"`;

    if (spec.ids !== undefined && spec.ids.length > 0) {
      const r = await this.sql.unsafe(
        `DELETE FROM ${q} WHERE id = ANY($1::text[])`,
        [spec.ids],
      );
      return r.count;
    }

    if (spec.sourceRecordIds !== undefined && spec.sourceRecordIds.length > 0) {
      const r = await this.sql.unsafe(
        `DELETE FROM ${q} WHERE source_record_id = ANY($1::text[])`,
        [spec.sourceRecordIds],
      );
      return r.count;
    }

    if (spec.filter !== undefined) {
      const r = await this.sql.unsafe(
        `DELETE FROM ${q} WHERE payload @> $1::jsonb`,
        [JSON.stringify(spec.filter)],
      );
      return r.count;
    }

    return 0;
  }

  createSnapshot(_collection: string): Promise<string> {
    return Promise.reject(
      new VectorAdapterError(
        "Collection snapshots are not supported for pgvector",
      ),
    );
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
