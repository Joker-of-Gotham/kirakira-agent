import type { PolicyDecision } from "@kirakira/core";
import type { PepAgentContext } from "../pep/pep-types.js";

export interface AuditWriterContext {
  traceId: string;
  sessionId: string;
  userId: string;
  agent?: PepAgentContext;
}

/** Pluggable persistence for enforcement traces (implement on the host runtime). */
export interface AuditWriter {
  onDenied(ctx: AuditWriterContext, decision: PolicyDecision, detail?: unknown): Promise<void>;
  onAllowed(ctx: AuditWriterContext, decision: PolicyDecision): Promise<void>;
  onExecuted(
    ctx: AuditWriterContext,
    decision: PolicyDecision,
    executionResult: unknown,
  ): Promise<void>;
}
