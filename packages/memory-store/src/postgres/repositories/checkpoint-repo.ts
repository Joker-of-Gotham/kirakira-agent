import type { CheckpointEnvelope, CheckpointRepository } from "@kirakira/event-store";
import type postgres from "postgres";

import type { PgSql } from "../pg-sql.js";

export interface PostgresCheckpointRepositoryOptions {
  tableName?: string;
}

type CheckpointRow = {
  id: string;
  tenant_id: string;
  run_id: string;
  task_id: string | null;
  step_no: number;
  state_json: unknown;
  artifact_manifest: Record<string, unknown>;
  parent_checkpoint_id: string | null;
  created_at: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractMetadata(payload: unknown): {
  tenantId: string;
  taskId: string | null;
  stepNo: number;
  artifactManifest: Record<string, unknown>;
  parentCheckpointId: string | null;
} {
  if (!isRecord(payload)) {
    throw new TypeError("checkpoint envelope payload must be a non-null object");
  }

  const tenantId = typeof payload.tenantId === "string" && payload.tenantId !== ""
    ? payload.tenantId
    : (() => { throw new TypeError("checkpoint envelope payload.tenantId is required"); })();
  const taskId = typeof payload.taskId === "string" ? payload.taskId : null;
  const stepNo = typeof payload.stepNo === "number" && Number.isFinite(payload.stepNo) ? payload.stepNo : 0;
  const artifactManifest = isRecord(payload.artifactManifest) ? payload.artifactManifest : {};
  const parentCheckpointId =
    typeof payload.parentCheckpointId === "string" ? payload.parentCheckpointId : null;

  return { tenantId, taskId, stepNo, artifactManifest, parentCheckpointId };
}

function rowToEnvelope(row: CheckpointRow): CheckpointEnvelope {
  return {
    id: row.id,
    runId: row.run_id,
    createdAt: row.created_at.toISOString(),
    version: "kirakira.checkpoint.v1",
    payload: row.state_json,
  };
}

/**
 * Postgres-backed {@link CheckpointRepository} using the `checkpoints` table from migrations.
 * Also provides run-scoped helpers for agent orchestration.
 */
export class PostgresCheckpointRepository implements CheckpointRepository {
  private readonly table: string;

  constructor(
    private readonly sql: PgSql,
    options?: PostgresCheckpointRepositoryOptions,
  ) {
    this.table = options?.tableName ?? "checkpoints";
  }

  async save(envelope: CheckpointEnvelope): Promise<void> {
    if (envelope.version !== "kirakira.checkpoint.v1") {
      throw new TypeError(`unsupported checkpoint envelope version: ${String(envelope.version)}`);
    }

    const meta = extractMetadata(envelope.payload);
    const stateJson =
      envelope.payload !== null &&
      typeof envelope.payload === "object" &&
      !Array.isArray(envelope.payload)
        ? (envelope.payload as object)
        : { value: envelope.payload };

    await this.sql`
      INSERT INTO ${this.sql(this.table)} (
        id,
        tenant_id,
        run_id,
        task_id,
        step_no,
        state_json,
        artifact_manifest,
        parent_checkpoint_id,
        created_at
      ) VALUES (
        ${envelope.id}::uuid,
        ${meta.tenantId},
        ${envelope.runId}::uuid,
        ${meta.taskId ?? null}::uuid,
        ${meta.stepNo},
        ${this.sql.json(stateJson as postgres.JSONValue)},
        ${this.sql.json(meta.artifactManifest as postgres.JSONValue)},
        ${meta.parentCheckpointId ?? null}::uuid,
        ${new Date(envelope.createdAt)}
      )
    `;
  }

  /**
   * {@link CheckpointRepository.load} — fetch by checkpoint id.
   */
  async load(id: string): Promise<CheckpointEnvelope | undefined> {
    return this.loadById(id);
  }

  async loadById(id: string): Promise<CheckpointEnvelope | undefined> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT *
      FROM ${this.sql(this.table)}
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToEnvelope(row) : undefined;
  }

  /**
   * Latest checkpoint for a run (highest `step_no`, tie-break by `created_at`).
   */
  async loadLatestByRunId(runId: string): Promise<CheckpointEnvelope | undefined> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT *
      FROM ${this.sql(this.table)}
      WHERE run_id = ${runId}::uuid
      ORDER BY step_no DESC, created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToEnvelope(row) : undefined;
  }

  async listByRunId(runId: string): Promise<CheckpointEnvelope[]> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT *
      FROM ${this.sql(this.table)}
      WHERE run_id = ${runId}::uuid
      ORDER BY step_no ASC, created_at ASC
    `;
    return rows.map(rowToEnvelope);
  }

  async delete(id: string): Promise<void> {
    await this.sql`
      DELETE FROM ${this.sql(this.table)}
      WHERE id = ${id}::uuid
    `;
  }
}
