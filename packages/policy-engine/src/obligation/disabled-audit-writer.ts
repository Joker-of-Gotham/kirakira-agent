import type { AuditWriter, AuditWriterContext } from "./audit-writer-types.js";
import type { PolicyDecision } from "@kirakira/core";

/** Audit writer that intentionally performs no I/O (e.g. audit disabled). */
export class DisabledAuditWriter implements AuditWriter {
  async onDenied(_ctx: AuditWriterContext, _decision: PolicyDecision, _detail?: unknown): Promise<void> {}

  async onAllowed(_ctx: AuditWriterContext, _decision: PolicyDecision): Promise<void> {}

  async onExecuted(
    _ctx: AuditWriterContext,
    _decision: PolicyDecision,
    _executionResult: unknown,
  ): Promise<void> {}
}
