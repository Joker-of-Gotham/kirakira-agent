import postgres from "postgres";
import { MEMORY_COLLECTIONS, VectorAdapterError } from "@kirakira/memory-core";

const ALLOWED = new Set<string>(Object.values(MEMORY_COLLECTIONS) as string[]);

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Validates a collection/table name is a safe identifier and in MEMORY_COLLECTIONS. */
export function assertPgCollectionName(tableName: string): string {
  if (!IDENT.test(tableName)) {
    throw new VectorAdapterError(
      `Invalid table name "${tableName}" (expected identifier pattern)`,
    );
  }
  if (!ALLOWED.has(tableName)) {
    throw new VectorAdapterError(
      `Table "${tableName}" must match a MEMORY_COLLECTIONS value`,
    );
  }
  return tableName;
}

export class PgVectorTableManager {
  constructor(
    private readonly sql: ReturnType<typeof postgres>,
  ) {}

  async ensureTable(tableName: string, dimension: number): Promise<void> {
    const name = assertPgCollectionName(tableName);
    const dim = Math.floor(dimension);
    if (!Number.isFinite(dim) || dim <= 0) {
      throw new VectorAdapterError("dimension must be a positive integer");
    }

    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${name}" (
        id TEXT PRIMARY KEY,
        source_record_id TEXT NOT NULL,
        embedding vector(${dim}),
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await this.sql.unsafe(`
      CREATE INDEX IF NOT EXISTS "${name}_embedding_hnsw"
      ON "${name}"
      USING hnsw (embedding vector_cosine_ops);
    `);
  }

  async dropTable(tableName: string): Promise<void> {
    const name = assertPgCollectionName(tableName);
    await this.sql.unsafe(`DROP TABLE IF EXISTS "${name}"`);
  }

  async listTables(): Promise<string[]> {
    const rows = await this.sql<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
    `;
    return rows
      .map((r) => r.tablename)
      .filter((t) => ALLOWED.has(t));
  }
}
