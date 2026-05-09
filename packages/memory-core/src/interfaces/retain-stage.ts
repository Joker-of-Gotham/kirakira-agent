import type { Episode } from "../types/episode.js";
import type { Fact } from "../types/fact.js";
import type { MemoryRecord } from "../types/memory-record.js";

export interface RetainContext {
  tenantId: string;
  workspaceId: string;
  actorId?: string;
  sessionId?: string;
  runId?: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RetainStageResult {
  episode?: Episode;
  records: MemoryRecord[];
  facts: Fact[];
  outboxPayloads: Array<{ eventType: string; payload: Record<string, unknown> }>;
}

export interface RetainStage {
  readonly name: string;
  readonly order: number;
  execute(ctx: RetainContext, previous: RetainStageResult): Promise<RetainStageResult>;
}
