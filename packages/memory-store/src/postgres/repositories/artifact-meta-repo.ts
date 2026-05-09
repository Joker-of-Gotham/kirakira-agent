import type { ArtifactMeta } from "@kirakira/memory-core";
import type postgres from "postgres";

import type { PgSql } from "../pg-sql.js";

export interface ArtifactMetaRepoOptions {
  tableName?: string;
}

type ArtifactRow = {
  id: string;
  tenant_id: string;
  uri: string;
  sha256: string;
  media_type: string;
  bytes: bigint;
  worm: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
};

function rowToArtifact(row: ArtifactRow): ArtifactMeta {
  const bytes =
    typeof row.bytes === "bigint" ? Number(row.bytes) : Number(row.bytes);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    uri: row.uri,
    sha256: row.sha256,
    mediaType: row.media_type,
    bytes: Number.isSafeInteger(bytes) ? bytes : Number.MAX_SAFE_INTEGER,
    worm: row.worm,
    metadata: row.metadata && Object.keys(row.metadata).length > 0 ? row.metadata : undefined,
    createdAt: row.created_at.toISOString(),
  };
}

export class ArtifactMetaRepository {
  private readonly table: string;

  constructor(
    private readonly sql: PgSql,
    options?: ArtifactMetaRepoOptions,
  ) {
    this.table = options?.tableName ?? "artifact_meta";
  }

  async insert(meta: ArtifactMeta): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.table)} (
        id,
        tenant_id,
        uri,
        sha256,
        media_type,
        bytes,
        worm,
        metadata,
        created_at
      ) VALUES (
        ${meta.id}::uuid,
        ${meta.tenantId},
        ${meta.uri},
        ${meta.sha256},
        ${meta.mediaType},
        ${meta.bytes},
        ${meta.worm},
        ${this.sql.json((meta.metadata ?? {}) as postgres.JSONValue)},
        ${new Date(meta.createdAt)}
      )
    `;
  }

  async findById(id: string): Promise<ArtifactMeta | undefined> {
    const rows = await this.sql<ArtifactRow[]>`
      SELECT * FROM ${this.sql(this.table)}
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToArtifact(row) : undefined;
  }

  async findBySha256(sha256: string): Promise<ArtifactMeta | undefined> {
    const rows = await this.sql<ArtifactRow[]>`
      SELECT * FROM ${this.sql(this.table)}
      WHERE sha256 = ${sha256}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToArtifact(row) : undefined;
  }

  async listForTenant(tenantId: string, limit = 100): Promise<ArtifactMeta[]> {
    const rows = await this.sql<ArtifactRow[]>`
      SELECT * FROM ${this.sql(this.table)}
      WHERE tenant_id = ${tenantId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(rowToArtifact);
  }

  async delete(id: string): Promise<number> {
    const result = await this.sql`
      DELETE FROM ${this.sql(this.table)}
      WHERE id = ${id}::uuid
    `;
    return result.count;
  }
}
