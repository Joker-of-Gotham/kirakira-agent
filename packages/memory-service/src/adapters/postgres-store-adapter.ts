import { randomUUID } from "node:crypto";

import type {
  DeletionJob as CoreDeletionJob,
  Episode,
  EpisodeSegment,
  MemoryCheckpoint,
  MemoryRecord,
  OutboxEvent,
  RecordFilter,
  StoreAdapter,
} from "@kirakira/memory-core";
import type { ArtifactMeta } from "@kirakira/memory-core";
import type postgres from "postgres";
import {
  ArtifactMetaRepository,
  DeletionJobRepository,
  EpisodeRepository,
  MemoryRecordRepository,
  OutboxRepository,
  runMigrations,
  type DeletionJob as RepoDeletionJob,
  type OutboxRow,
  type PgSql,
} from "@kirakira/memory-store";

function isPoolSql(sql: PgSql): sql is postgres.Sql {
  return typeof (sql as postgres.Sql).end === "function";
}

type CheckpointRow = {
  id: string;
  tenant_id: string;
  run_id: string;
  task_id: string | null;
  step_no: number;
  state_json: Record<string, unknown>;
  artifact_manifest: Record<string, unknown>;
  parent_checkpoint_id: string | null;
  created_at: Date;
};

function rowToMemoryCheckpoint(row: CheckpointRow): MemoryCheckpoint {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    runId: row.run_id,
    taskId: row.task_id ?? undefined,
    stepNo: row.step_no,
    stateJson: row.state_json,
    artifactManifest: row.artifact_manifest,
    parentCheckpointId: row.parent_checkpoint_id ?? undefined,
    createdAt: row.created_at.toISOString(),
  };
}

function mapOutboxRow(row: OutboxRow): OutboxEvent {
  return {
    id: String(row.id),
    tenantId: row.tenantId ?? "",
    aggregateType: row.aggregateType ?? "",
    aggregateId: row.aggregateId ?? "",
    eventType: row.eventType,
    payload:
      row.payload !== null && typeof row.payload === "object" && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : { value: row.payload as unknown },
    status: row.status,
    attempts: row.attempts,
    availableAt: row.availableAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Postgres-backed {@link StoreAdapter} composed from `memory-store` repositories.
 */
export class PostgresStoreAdapter implements StoreAdapter {
  private readonly records: MemoryRecordRepository;
  private readonly episodes: EpisodeRepository;
  private readonly outbox: OutboxRepository;
  private readonly jobs: DeletionJobRepository;
  private readonly artifacts: ArtifactMetaRepository;

  constructor(private readonly sql: PgSql) {
    this.records = new MemoryRecordRepository(sql);
    this.episodes = new EpisodeRepository(sql);
    this.outbox = new OutboxRepository(sql);
    this.jobs = new DeletionJobRepository(sql);
    this.artifacts = new ArtifactMetaRepository(sql);
  }

  async insertRecord(record: MemoryRecord): Promise<void> {
    await this.records.insert(record);
  }

  async insertRecords(records: MemoryRecord[]): Promise<void> {
    await Promise.all(records.map((r) => this.records.insert(r)));
  }

  async getRecord(id: string): Promise<MemoryRecord | null> {
    const row = await this.records.findById(id);
    return row ?? null;
  }

  async queryRecords(filter: RecordFilter): Promise<MemoryRecord[]> {
    const kind =
      filter.kinds && filter.kinds.length === 1 ? filter.kinds[0] : undefined;
    const rows = await this.records.query({
      tenantId: filter.tenantId,
      workspaceId: filter.workspaceId,
      namespace: filter.namespace,
      kind,
      validAt: filter.validAt,
      txAt: filter.txAt,
      includeTombstoned: filter.tombstoned === true,
      limit: filter.limit,
    });
    let out = rows;
    if (filter.kinds && filter.kinds.length > 1) {
      const set = new Set(filter.kinds);
      out = out.filter((r) => set.has(r.kind));
    }
    if (filter.entityIds && filter.entityIds.length > 0) {
      const eSet = new Set(filter.entityIds);
      out = out.filter((r) => r.entityIds.some((e) => eSet.has(e)));
    }
    return out;
  }

  async tombstoneRecord(id: string, reason: string): Promise<void> {
    await this.records.tombstone(id, new Date());
    void reason;
  }

  async tombstoneRecords(ids: string[], reason: string): Promise<void> {
    await this.records.tombstoneBatch(ids, new Date());
    void reason;
  }

  async insertEpisode(episode: Episode): Promise<void> {
    await this.episodes.insertEpisode(episode);
  }

  async insertEpisodeSegment(segment: EpisodeSegment): Promise<void> {
    await this.episodes.insertSegment(segment);
  }

  async getEpisode(id: string): Promise<Episode | null> {
    const e = await this.episodes.findEpisodeById(id);
    return e ?? null;
  }

  async queryEpisodes(tenantId: string, workspaceId: string, limit: number): Promise<Episode[]> {
    return this.episodes.listEpisodesForWorkspace(tenantId, workspaceId, limit);
  }

  async saveCheckpoint(checkpoint: MemoryCheckpoint): Promise<void> {
    await this.sql`
      INSERT INTO checkpoints (
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
        ${checkpoint.id}::uuid,
        ${checkpoint.tenantId},
        ${checkpoint.runId}::uuid,
        ${checkpoint.taskId ?? null}::uuid,
        ${checkpoint.stepNo},
        ${this.sql.json(checkpoint.stateJson as postgres.JSONValue)},
        ${this.sql.json(checkpoint.artifactManifest as postgres.JSONValue)},
        ${checkpoint.parentCheckpointId ?? null}::uuid,
        ${new Date(checkpoint.createdAt)}
      )
    `;
  }

  async loadCheckpoint(runId: string): Promise<MemoryCheckpoint | null> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT *
      FROM checkpoints
      WHERE run_id = ${runId}::uuid
      ORDER BY step_no DESC, created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToMemoryCheckpoint(row) : null;
  }

  async loadCheckpointById(id: string): Promise<MemoryCheckpoint | null> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT *
      FROM checkpoints
      WHERE id = ${id}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    return row ? rowToMemoryCheckpoint(row) : null;
  }

  async listCheckpoints(runId: string): Promise<MemoryCheckpoint[]> {
    const rows = await this.sql<CheckpointRow[]>`
      SELECT *
      FROM checkpoints
      WHERE run_id = ${runId}::uuid
      ORDER BY step_no ASC, created_at ASC
    `;
    return rows.map(rowToMemoryCheckpoint);
  }

  async insertArtifactMeta(meta: ArtifactMeta): Promise<void> {
    await this.artifacts.insert(meta);
  }

  async getArtifactMeta(id: string): Promise<ArtifactMeta | null> {
    const m = await this.artifacts.findById(id);
    return m ?? null;
  }

  async pushOutboxEvent(
    event: Omit<OutboxEvent, "id" | "status" | "attempts" | "createdAt">,
  ): Promise<string> {
    return this.outbox.push({
      tenantId: event.tenantId || undefined,
      aggregateType: event.aggregateType || undefined,
      aggregateId: event.aggregateId || undefined,
      eventType: event.eventType,
      payload: event.payload,
    });
  }

  async claimOutboxEvents(limit: number): Promise<OutboxEvent[]> {
    const rows = await this.outbox.claim(limit);
    return rows.map(mapOutboxRow);
  }

  async completeOutboxEvent(id: string): Promise<void> {
    await this.outbox.complete(id);
  }

  async failOutboxEvent(id: string, error: string): Promise<void> {
    await this.outbox.fail(id, error);
  }

  async createDeletionJob(
    job: Omit<CoreDeletionJob, "id" | "status" | "storeResults" | "createdAt">,
  ): Promise<string> {
    const id = randomUUID();
    const nowIso = new Date().toISOString();
    const row: RepoDeletionJob = {
      id,
      tenantId: job.tenantId,
      workspaceId: undefined,
      status: "pending",
      targetKind: "memory_record",
      targetIds: job.recordIds,
      reason: job.reason,
      requestedBy: undefined,
      metadata: {},
      errorMessage: undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await this.jobs.insert(row);
    return id;
  }

  async updateDeletionJob(id: string, updates: Partial<CoreDeletionJob>): Promise<void> {
    const existing = await this.jobs.findById(id);
    if (!existing) return;
    if (updates.status !== undefined) {
      const statusMap: RepoDeletionJob["status"] =
        updates.status === "running"
          ? "running"
          : updates.status === "completed"
            ? "completed"
            : updates.status === "failed"
              ? "failed"
              : "pending";
      await this.jobs.updateStatus(id, {
        status: statusMap,
        errorMessage: undefined,
        startedAt: updates.status === "running" ? new Date().toISOString() : undefined,
        completedAt:
          updates.status === "completed" || updates.status === "failed"
            ? new Date().toISOString()
            : undefined,
      });
    }
    if (updates.storeResults !== undefined) {
      await this.sql`
        UPDATE deletion_jobs
        SET metadata = ${this.sql.json({ ...existing.metadata, storeResults: updates.storeResults } as postgres.JSONValue)},
            updated_at = now()
        WHERE id = ${id}::uuid
      `;
    }
  }

  async runMigrations(): Promise<void> {
    if (!isPoolSql(this.sql)) {
      throw new TypeError("runMigrations requires a root postgres.Sql pool, not a transaction");
    }
    await runMigrations(this.sql);
  }

  async close(): Promise<void> {
    if (isPoolSql(this.sql)) {
      await this.sql.end({ timeout: 5 });
    }
  }
}
