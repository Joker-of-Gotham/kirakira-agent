import type { MemoryRecord, MemoryKind, MemoryNamespace, PiiLevel, RetentionClass } from "@kirakira/memory-core";
import type postgres from "postgres";

import type { MemoryRecordFilter } from "../record-filter.js";

export interface MemoryRecordRepoOptions {
  tableName?: string;
}

type MemoryRow = {
  id: string;
  tenant_id: string;
  workspace_id: string;
  namespace: string;
  kind: string;
  text: string | null;
  summary_l0: string | null;
  overview_l1: string | null;
  metadata: Record<string, unknown>;
  confidence: number | null;
  evidence_ids: string[] | null;
  entity_ids: string[] | null;
  valid_from: Date | null;
  valid_to: Date | null;
  tx_from: Date;
  tx_to: Date | null;
  retention_class: string;
  pii_level: string;
  redacted: boolean;
  tombstoned_at: Date | null;
  created_at: Date;
};

function toIso(d: Date | null | undefined): string | undefined {
  if (!d) return undefined;
  return d.toISOString();
}

function rowToRecord(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    namespace: row.namespace as MemoryNamespace,
    kind: row.kind as MemoryKind,
    text: row.text ?? undefined,
    summaryL0: row.summary_l0 ?? undefined,
    overviewL1: row.overview_l1 ?? undefined,
    metadata: row.metadata ?? {},
    confidence: row.confidence ?? undefined,
    evidenceIds: row.evidence_ids ?? [],
    entityIds: row.entity_ids ?? [],
    validFrom: toIso(row.valid_from),
    validTo: toIso(row.valid_to),
    txFrom: row.tx_from.toISOString(),
    txTo: toIso(row.tx_to),
    retentionClass: row.retention_class as RetentionClass,
    piiLevel: row.pii_level as PiiLevel,
    redacted: row.redacted,
    tombstonedAt: toIso(row.tombstoned_at),
    createdAt: row.created_at.toISOString(),
  };
}

function asInstant(value: Date | string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? new Date(value) : value;
}

type MemorySql = postgres.Sql | postgres.TransactionSql;

export class MemoryRecordRepository {
  private readonly table: string;

  constructor(
    private readonly sql: MemorySql,
    options?: MemoryRecordRepoOptions,
  ) {
    this.table = options?.tableName ?? "memory_records";
  }

  async insert(record: MemoryRecord): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.table)} (
        id,
        tenant_id,
        workspace_id,
        namespace,
        kind,
        text,
        summary_l0,
        overview_l1,
        metadata,
        confidence,
        evidence_ids,
        entity_ids,
        valid_from,
        valid_to,
        tx_from,
        tx_to,
        retention_class,
        pii_level,
        redacted,
        tombstoned_at,
        created_at
      ) VALUES (
        ${record.id}::uuid,
        ${record.tenantId},
        ${record.workspaceId},
        ${record.namespace},
        ${record.kind},
        ${record.text ?? null},
        ${record.summaryL0 ?? null},
        ${record.overviewL1 ?? null},
        ${this.sql.json(record.metadata as postgres.JSONValue)},
        ${record.confidence ?? null},
        ${this.sql.array(record.evidenceIds.filter(Boolean).map((id) => id as string))}::uuid[],
        ${this.sql.array(record.entityIds.filter(Boolean).map((id) => id as string))}::uuid[],
        ${record.validFrom ? new Date(record.validFrom) : null},
        ${record.validTo ? new Date(record.validTo) : null},
        ${new Date(record.txFrom)},
        ${record.txTo ? new Date(record.txTo) : null},
        ${record.retentionClass},
        ${record.piiLevel},
        ${record.redacted},
        ${record.tombstonedAt ? new Date(record.tombstonedAt) : null},
        ${new Date(record.createdAt)}
      )
    `;
  }

  async insertBatch(records: MemoryRecord[]): Promise<void> {
    if (records.length === 0) return;
    const root = this.sql;
    if (!("begin" in root) || typeof root.begin !== "function") {
      throw new TypeError("MemoryRecordRepository.insertBatch requires a connection-scoped sql client");
    }
    await root.begin(async (tx: postgres.TransactionSql) => {
      for (const record of records) {
        await new MemoryRecordRepository(tx, { tableName: this.table }).insert(record);
      }
    });
  }

  async findById(id: string, createdAt?: Date | string): Promise<MemoryRecord | undefined> {
    const created = asInstant(createdAt);
    const rows = created
      ? await this.sql<MemoryRow[]>`
          SELECT *
          FROM ${this.sql(this.table)}
          WHERE id = ${id}::uuid
            AND created_at = ${created}
          LIMIT 1
        `
      : await this.sql<MemoryRow[]>`
          SELECT *
          FROM ${this.sql(this.table)}
          WHERE id = ${id}::uuid
          ORDER BY created_at DESC
          LIMIT 1
        `;
    const row = rows[0];
    return row ? rowToRecord(row) : undefined;
  }

  async query(filter: MemoryRecordFilter): Promise<MemoryRecord[]> {
    const conditions: postgres.PendingQuery<postgres.Row[]>[] = [];

    if (filter.tenantId) {
      conditions.push(this.sql`tenant_id = ${filter.tenantId}`);
    }
    if (filter.workspaceId) {
      conditions.push(this.sql`workspace_id = ${filter.workspaceId}`);
    }
    if (filter.namespace) {
      conditions.push(this.sql`namespace = ${filter.namespace}`);
    }
    if (filter.kind) {
      conditions.push(this.sql`kind = ${filter.kind}`);
    }
    if (filter.ids && filter.ids.length > 0) {
      conditions.push(this.sql`id = ANY(${this.sql.array(filter.ids)}::uuid[])`);
    }

    const validAt = asInstant(filter.validAt);
    if (validAt) {
      conditions.push(this.sql`(valid_from IS NULL OR valid_from <= ${validAt})`);
      conditions.push(this.sql`(valid_to IS NULL OR valid_to > ${validAt})`);
    }

    const txAt = asInstant(filter.txAt);
    if (txAt) {
      conditions.push(this.sql`tx_from <= ${txAt}`);
      conditions.push(this.sql`(tx_to IS NULL OR tx_to > ${txAt})`);
    }

    if (!filter.includeTombstoned) {
      conditions.push(this.sql`tombstoned_at IS NULL`);
    }

    const where =
      conditions.length === 0
        ? this.sql``
        : this.sql`WHERE ${conditions.slice(1).reduce(
            (acc, frag) => this.sql`${acc} AND ${frag}`,
            conditions[0]!,
          )}`;

    const order =
      (filter.orderByCreatedDesc ?? true)
        ? this.sql`ORDER BY created_at DESC`
        : this.sql`ORDER BY created_at ASC`;

    const limit =
      filter.limit !== undefined ? this.sql`LIMIT ${filter.limit}` : this.sql``;
    const offset =
      filter.offset !== undefined ? this.sql`OFFSET ${filter.offset}` : this.sql``;

    const rows = await this.sql<MemoryRow[]>`
      SELECT *
      FROM ${this.sql(this.table)}
      ${where}
      ${order}
      ${limit}
      ${offset}
    `;

    return rows.map(rowToRecord);
  }

  async tombstone(id: string, at: Date | string = new Date(), createdAt?: Date | string): Promise<number> {
    const instant = asInstant(at);
    if (!instant) {
      throw new TypeError("at must be a Date or ISO string");
    }
    const created = asInstant(createdAt);

    const scope = created
      ? this.sql`id = ${id}::uuid AND created_at = ${created}`
      : this.sql`id = ${id}::uuid`;

    const result = await this.sql`
      UPDATE ${this.sql(this.table)}
      SET tombstoned_at = ${instant},
          tx_to = COALESCE(tx_to, ${instant})
      WHERE ${scope}
    `;
    return result.count;
  }

  async tombstoneBatch(ids: string[], at: Date | string = new Date()): Promise<number> {
    if (ids.length === 0) return 0;
    const instant = asInstant(at);
    if (!instant) {
      throw new TypeError("at must be a Date or ISO string");
    }
    const result = await this.sql`
      UPDATE ${this.sql(this.table)}
      SET tombstoned_at = ${instant},
          tx_to = COALESCE(tx_to, ${instant})
      WHERE id = ANY(${this.sql.array(ids)}::uuid[])
    `;
    return result.count;
  }
}
