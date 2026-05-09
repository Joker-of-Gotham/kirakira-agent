import type { MemoryRecord, MemoryKind, MemoryNamespace } from "../types/memory-record.js";
import type { Episode } from "../types/episode.js";
import type { MemoryCheckpoint } from "../types/checkpoint.js";
import type { ArtifactMeta } from "../types/artifact-meta.js";

export interface RecordFilter {
  tenantId: string;
  workspaceId?: string;
  namespace?: MemoryNamespace;
  kinds?: MemoryKind[];
  entityIds?: string[];
  validAt?: string;
  txAt?: string;
  tombstoned?: boolean;
  limit?: number;
  offset?: number;
}

export interface OutboxEvent {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "completed" | "failed" | "dead_letter";
  attempts: number;
  availableAt: string;
  createdAt: string;
}

export interface DeletionJob {
  id: string;
  tenantId: string;
  recordIds: string[];
  reason: string;
  status: "pending" | "running" | "completed" | "failed";
  storeResults: Record<string, { deleted: number; errors: string[] }>;
  createdAt: string;
  completedAt?: string;
}

export interface StoreAdapter {
  insertRecord(record: MemoryRecord): Promise<void>;
  insertRecords(records: MemoryRecord[]): Promise<void>;
  getRecord(id: string): Promise<MemoryRecord | null>;
  queryRecords(filter: RecordFilter): Promise<MemoryRecord[]>;
  tombstoneRecord(id: string, reason: string): Promise<void>;
  tombstoneRecords(ids: string[], reason: string): Promise<void>;

  insertEpisode(episode: Episode): Promise<void>;
  getEpisode(id: string): Promise<Episode | null>;
  queryEpisodes(tenantId: string, workspaceId: string, limit: number): Promise<Episode[]>;

  saveCheckpoint(checkpoint: MemoryCheckpoint): Promise<void>;
  loadCheckpoint(runId: string): Promise<MemoryCheckpoint | null>;
  loadCheckpointById(id: string): Promise<MemoryCheckpoint | null>;
  listCheckpoints(runId: string): Promise<MemoryCheckpoint[]>;

  insertArtifactMeta(meta: ArtifactMeta): Promise<void>;
  getArtifactMeta(id: string): Promise<ArtifactMeta | null>;

  pushOutboxEvent(event: Omit<OutboxEvent, "id" | "status" | "attempts" | "createdAt">): Promise<string>;
  claimOutboxEvents(limit: number): Promise<OutboxEvent[]>;
  completeOutboxEvent(id: string): Promise<void>;
  failOutboxEvent(id: string, error: string): Promise<void>;

  createDeletionJob(job: Omit<DeletionJob, "id" | "status" | "storeResults" | "createdAt">): Promise<string>;
  updateDeletionJob(id: string, updates: Partial<DeletionJob>): Promise<void>;

  runMigrations(): Promise<void>;
  close(): Promise<void>;
}
