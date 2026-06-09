import type { CheckpointEnvelope, CheckpointRepository } from "@kirakira/event-store";
import type postgres from "postgres";

import type { PgSql } from "../pg-sql.js";

export interface PostgresCheckpointEnvelopeRepositoryOptions {
  tableName?: string;
}

type CheckpointEnvelopeRow = {
  id: string;
  run_id: string;
  created_at: Date | string;
  envelope: unknown;
};

function assertEnvelope(value: unknown): CheckpointEnvelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("checkpoint envelope row must contain an object envelope");
  }
  const envelope = value as Partial<CheckpointEnvelope>;
  if (
    typeof envelope.id !== "string" ||
    typeof envelope.runId !== "string" ||
    typeof envelope.createdAt !== "string" ||
    envelope.version !== "kirakira.checkpoint.v1"
  ) {
    throw new TypeError("checkpoint envelope row has an invalid envelope shape");
  }
  return envelope as CheckpointEnvelope;
}

function createdAtDate(envelope: CheckpointEnvelope): Date {
  const parsed = new Date(envelope.createdAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new TypeError(`checkpoint envelope createdAt is invalid: ${envelope.createdAt}`);
  }
  return parsed;
}

function rowToEnvelope(row: CheckpointEnvelopeRow): CheckpointEnvelope {
  return assertEnvelope(row.envelope);
}

/**
 * Event-store checkpoint repository backed by memory-store Postgres.
 *
 * This stores daemon checkpoint envelopes separately from the MemoryService
 * `checkpoints` DTO table because the orchestrator kernel uses opaque ULIDs
 * for run/checkpoint ids while the service DTO table still carries UUID casts.
 */
export class PostgresCheckpointEnvelopeRepository implements CheckpointRepository {
  private readonly table: string;

  constructor(
    private readonly sql: PgSql,
    options?: PostgresCheckpointEnvelopeRepositoryOptions,
  ) {
    this.table = options?.tableName ?? "daemon_checkpoints";
  }

  async save(envelope: CheckpointEnvelope): Promise<void> {
    if (envelope.version !== "kirakira.checkpoint.v1") {
      throw new TypeError(`unsupported checkpoint envelope version: ${String(envelope.version)}`);
    }

    await this.sql`
      INSERT INTO ${this.sql(this.table)} (
        id,
        run_id,
        created_at,
        envelope
      ) VALUES (
        ${envelope.id},
        ${envelope.runId},
        ${createdAtDate(envelope)},
        ${this.sql.json(envelope as unknown as postgres.JSONValue)}
      )
      ON CONFLICT (id) DO UPDATE SET
        run_id = EXCLUDED.run_id,
        created_at = EXCLUDED.created_at,
        envelope = EXCLUDED.envelope
    `;
  }

  async load(id: string): Promise<CheckpointEnvelope | undefined> {
    const rows = await this.sql<CheckpointEnvelopeRow[]>`
      SELECT id, run_id, created_at, envelope
      FROM ${this.sql(this.table)}
      WHERE id = ${id}
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToEnvelope(row) : undefined;
  }

  async loadLatestByRunId(runId: string): Promise<CheckpointEnvelope | undefined> {
    const rows = await this.sql<CheckpointEnvelopeRow[]>`
      SELECT id, run_id, created_at, envelope
      FROM ${this.sql(this.table)}
      WHERE run_id = ${runId}
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToEnvelope(row) : undefined;
  }

  async listByRunId(runId: string): Promise<CheckpointEnvelope[]> {
    const rows = await this.sql<CheckpointEnvelopeRow[]>`
      SELECT id, run_id, created_at, envelope
      FROM ${this.sql(this.table)}
      WHERE run_id = ${runId}
      ORDER BY created_at ASC, id ASC
    `;
    return rows.map(rowToEnvelope);
  }

  async delete(id: string): Promise<void> {
    await this.sql`
      DELETE FROM ${this.sql(this.table)}
      WHERE id = ${id}
    `;
  }
}
