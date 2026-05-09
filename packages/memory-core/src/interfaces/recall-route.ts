import type { RouteExplanation } from "../types/retrieval-trace.js";
import type { MemoryKind, MemoryRecord } from "../types/memory-record.js";

export interface RecallRouteInput {
  tenantId: string;
  workspaceId: string;
  query: string;
  normalizedQuery: string;
  entityIds: string[];
  kinds?: MemoryKind[];
  timeWindow?: { from?: string; to?: string };
  runId?: string;
  sessionId?: string;
  limit: number;
  embedding?: number[];
}

export interface RecallRouteResult {
  records: Array<{ record: MemoryRecord; score: number }>;
  explanation: RouteExplanation;
}

export interface RecallRoute {
  readonly name: string;
  readonly weight: number;
  execute(input: RecallRouteInput): Promise<RecallRouteResult>;
}
