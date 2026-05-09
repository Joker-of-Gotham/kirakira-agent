import type { MemoryBundle } from "../types/memory-bundle.js";
import type { MemoryKind, MemoryNamespace, PiiLevel, RetentionClass } from "../types/memory-record.js";
import type { CheckpointRef, RestoredState } from "../types/checkpoint.js";
import type { RetrievalTrace } from "../types/retrieval-trace.js";
import type { ContextLevel } from "../types/context-fs.js";
import type { EpisodeSourceType } from "../types/episode.js";

export interface RetainRequest {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  namespace: MemoryNamespace;
  sourceType: EpisodeSourceType;
  content: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  runId?: string;
  retentionClass?: RetentionClass;
  piiLevel?: PiiLevel;
}

export interface RetainReceipt {
  episodeId: string;
  memoryRecordIds: string[];
  factIds: string[];
  outboxEventId: string;
  retainedAt: string;
}

export interface RecallRequest {
  tenantId: string;
  workspaceId: string;
  query: string;
  namespace?: MemoryNamespace;
  kinds?: MemoryKind[];
  entityIds?: string[];
  timeWindow?: { from?: string; to?: string };
  runId?: string;
  sessionId?: string;
  tokenBudget?: number;
  level?: ContextLevel;
  limit?: number;
  includeRedacted?: boolean;
}

export interface ReflectRequest {
  tenantId: string;
  workspaceId: string;
  scope?: string;
  factIds?: string[];
  episodeIds?: string[];
  maxConsolidations?: number;
}

export interface ReflectReceipt {
  observationIds: string[];
  beliefUpdates: Array<{ beliefId: string; action: "created" | "updated" | "invalidated" }>;
  contradictions: Array<{ factId: string; conflictsWith: string; resolution: string }>;
  reflectedAt: string;
}

export interface CheckpointRequest {
  tenantId: string;
  runId: string;
  taskId?: string;
  stepNo: number;
  state: Record<string, unknown>;
  artifactManifest?: Record<string, unknown>;
  parentCheckpointId?: string;
}

export interface ForgetRequest {
  tenantId: string;
  workspaceId: string;
  recordIds?: string[];
  actorId?: string;
  namespace?: MemoryNamespace;
  beforeDate?: string;
  reason: string;
  dryRun?: boolean;
}

export interface ForgetReceipt {
  tombstonedIds: string[];
  indexesDeleted: number;
  cacheKeysEvicted: number;
  graphEdgesInvalidated: number;
  dryRun: boolean;
  forgotAt: string;
}

export interface ExportRequest {
  tenantId: string;
  workspaceId?: string;
  actorId?: string;
  format: "jsonl" | "json";
  includeBlobs?: boolean;
}

export interface ExportReceipt {
  exportId: string;
  blobUri: string;
  recordCount: number;
  totalBytes: number;
  exportedAt: string;
}

export interface ExplainRetrievalRequest {
  traceId: string;
}

export interface MemoryService {
  retain(req: RetainRequest): Promise<RetainReceipt>;
  recall(req: RecallRequest): Promise<MemoryBundle>;
  reflect(req: ReflectRequest): Promise<ReflectReceipt>;
  checkpoint(req: CheckpointRequest): Promise<CheckpointRef>;
  restore(ref: CheckpointRef): Promise<RestoredState>;
  forget(req: ForgetRequest): Promise<ForgetReceipt>;
  export(req: ExportRequest): Promise<ExportReceipt>;
  explainRetrieval(req: ExplainRetrievalRequest): Promise<RetrievalTrace>;
}
