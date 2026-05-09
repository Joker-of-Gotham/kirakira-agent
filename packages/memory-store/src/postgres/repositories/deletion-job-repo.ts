import type postgres from "postgres";

import type { PgSql } from "../pg-sql.js";

export type DeletionJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface DeletionJob {
  id: string;
  tenantId: string;
  workspaceId?: string;
  status: DeletionJobStatus;
  targetKind: string;
  targetIds: string[];
  reason?: string;
  requestedBy?: string;
  metadata: Record<string, unknown>;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DeletionJobRepositoryOptions {
  tableName?: string;
}

type Row = {
  id: string;
  tenant_id: string;
  workspace_id: string | null;
  status: string;
  target_kind: string;
  target_ids: string[] | null;
  reason: string | null;
  requested_by: string | null;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
};

function toJob(row: Row): DeletionJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id ?? undefined,
    status: row.status as DeletionJobStatus,
    targetKind: row.target_kind,
    targetIds: row.target_ids ?? [],
    reason: row.reason ?? undefined,
    requestedBy: row.requested_by ?? undefined,
    metadata: row.metadata ?? {},
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    startedAt: row.started_at ? row.started_at.toISOString() : undefined,
    completedAt: row.completed_at ? row.completed_at.toISOString() : undefined,
  };
}

export class DeletionJobRepository {
  private readonly table: string;

  constructor(
    private readonly sql: PgSql,
    options?: DeletionJobRepositoryOptions,
  ) {
    this.table = options?.tableName ?? "deletion_jobs";
  }

  async insert(job: DeletionJob): Promise<void> {
    await this.sql`
      INSERT INTO ${this.sql(this.table)} (
        id,
        tenant_id,
        workspace_id,
        status,
        target_kind,
        target_ids,
        reason,
        requested_by,
        metadata,
        error_message,
        created_at,
        updated_at,
        started_at,
        completed_at
      ) VALUES (
        ${job.id}::uuid,
        ${job.tenantId},
        ${job.workspaceId ?? null},
        ${job.status},
        ${job.targetKind},
        ${this.sql.array(job.targetIds)}::uuid[],
        ${job.reason ?? null},
        ${job.requestedBy ?? null},
        ${this.sql.json(job.metadata as postgres.JSONValue)},
        ${job.errorMessage ?? null},
        ${new Date(job.createdAt)},
        ${new Date(job.updatedAt)},
        ${job.startedAt ? new Date(job.startedAt) : null},
        ${job.completedAt ? new Date(job.completedAt) : null}
      )
    `;
  }

  async findById(id: string): Promise<DeletionJob | undefined> {
    const rows = await this.sql<Row[]>`
      SELECT * FROM ${this.sql(this.table)}
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    return row ? toJob(row) : undefined;
  }

  async listPending(tenantId: string, limit = 50): Promise<DeletionJob[]> {
    const rows = await this.sql<Row[]>`
      SELECT * FROM ${this.sql(this.table)}
      WHERE tenant_id = ${tenantId}
        AND status IN ('pending', 'running')
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows.map(toJob);
  }

  async updateStatus(
    id: string,
    patch: Partial<Pick<DeletionJob, "status" | "errorMessage" | "startedAt" | "completedAt">>,
  ): Promise<number> {
    const updates: postgres.PendingQuery<postgres.Row[]>[] = [];

    if (patch.status !== undefined) {
      updates.push(this.sql`status = ${patch.status}`);
    }
    if (patch.errorMessage !== undefined) {
      updates.push(this.sql`error_message = ${patch.errorMessage}`);
    }
    if (patch.startedAt !== undefined) {
      updates.push(this.sql`started_at = ${new Date(patch.startedAt)}`);
    }
    if (patch.completedAt !== undefined) {
      updates.push(this.sql`completed_at = ${new Date(patch.completedAt)}`);
    }

    if (updates.length === 0) {
      return 0;
    }

    updates.push(this.sql`updated_at = now()`);

    const setClause = updates.slice(1).reduce((acc, frag) => this.sql`${acc}, ${frag}`, updates[0]!);

    const result = await this.sql`
      UPDATE ${this.sql(this.table)}
      SET ${setClause}
      WHERE id = ${id}::uuid
    `;
    return result.count;
  }
}
