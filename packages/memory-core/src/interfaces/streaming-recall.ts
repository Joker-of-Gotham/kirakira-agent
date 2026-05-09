import type { ContextBundle, ContextLevel } from "../types/context-fs.js";
import type { MemoryRecord } from "../types/memory-record.js";
import type { RetrievalTrace, RouteExplanation } from "../types/retrieval-trace.js";
import type { RecallRequest } from "./memory-service.js";

/**
 * Incremental recall events yielded during streaming recall.
 * This enables progressive context injection — the agent can start
 * consuming L0/L1 results while deeper routes are still executing.
 *
 * This goes beyond Codex/Claude Code which batch-return recall results.
 */
export type RecallStreamEvent =
  | RecallStreamRouteStart
  | RecallStreamRouteComplete
  | RecallStreamPartialContext
  | RecallStreamFusionComplete
  | RecallStreamDone;

export interface RecallStreamRouteStart {
  type: "route:start";
  routeName: string;
  timestamp: string;
}

export interface RecallStreamRouteComplete {
  type: "route:complete";
  routeName: string;
  candidateCount: number;
  explanation: RouteExplanation;
  durationMs: number;
  timestamp: string;
}

export interface RecallStreamPartialContext {
  type: "context:partial";
  level: ContextLevel;
  context: Partial<ContextBundle>;
  records: MemoryRecord[];
  estimatedTokens: number;
  timestamp: string;
}

export interface RecallStreamFusionComplete {
  type: "fusion:complete";
  totalCandidates: number;
  selectedCount: number;
  timestamp: string;
}

export interface RecallStreamDone {
  type: "done";
  context: ContextBundle;
  trace: RetrievalTrace;
  recordIds: string[];
  totalTokens: number;
  totalDurationMs: number;
  timestamp: string;
}

export interface StreamingRecallOptions extends RecallRequest {
  /** If true, yield partial L0 context as soon as first route completes. */
  earlyL0?: boolean;
}
