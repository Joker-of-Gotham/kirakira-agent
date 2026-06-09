import type { AuditWriter, AuditWriterContext } from "./audit-writer-types.js";
import type { PolicyDecision } from "@kirakira/core";
import { appendFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

function getAuditDir(): string {
  return join(process.env.HOME ?? homedir(), ".kirakira", "audit", "ledger");
}

function dateSegment(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function executionContext(ctx: AuditWriterContext): Record<string, string> | undefined {
  const execution = {
    ...(ctx.agent?.subagentId !== undefined ? { subagent_id: ctx.agent.subagentId } : {}),
    ...(ctx.agent?.role !== undefined ? { role: ctx.agent.role } : {}),
    ...(ctx.agent?.lane !== undefined ? { lane: ctx.agent.lane } : {}),
    ...(ctx.agent?.requestedLane !== undefined ? { requested_lane: ctx.agent.requestedLane } : {}),
    ...(ctx.agent?.topologyId !== undefined ? { topology_id: ctx.agent.topologyId } : {}),
    ...(ctx.agent?.handoffId !== undefined ? { handoff_id: ctx.agent.handoffId } : {}),
  };
  return Object.keys(execution).length > 0 ? execution : undefined;
}

function buildAuditEvent(
  ctx: AuditWriterContext,
  decision: PolicyDecision,
  kind: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const execution = executionContext(ctx);
  return {
    version: "kirakira.audit.v1",
    event_id: `evt_${randomUUID().replace(/-/g, "").slice(0, 20)}`,
    ts: new Date().toISOString(),
    segment: dateSegment(),
    trace_id: ctx.traceId,
    session_id: ctx.sessionId,
    decision_id: decision.decision_id,
    kind,
    actor: {
      user_id: ctx.userId,
      interactive: true,
      ...(ctx.agent?.subagentId !== undefined ? { subagent_id: ctx.agent.subagentId } : {}),
      ...(ctx.agent?.role !== undefined ? { agent_role: ctx.agent.role } : {}),
      ...(ctx.agent?.lane !== undefined ? { agent_lane: ctx.agent.lane } : {}),
      ...(ctx.agent?.requestedLane !== undefined ? { requested_lane: ctx.agent.requestedLane } : {}),
      ...(ctx.agent?.topologyId !== undefined ? { topology_id: ctx.agent.topologyId } : {}),
      ...(ctx.agent?.handoffId !== undefined ? { handoff_id: ctx.agent.handoffId } : {}),
    },
    subject: {
      tool_type: decision.policy?.package ?? "unknown",
    },
    result: {
      effect: decision.effect,
      approval_required: decision.approval?.required ?? false,
      sandbox_profile:
        decision.obligations?.find((o: { type: string }) => o.type === "sandbox")?.profile ?? undefined,
      reason_codes: decision.reason_codes,
    },
    integrity: {
      bundle_id: decision.policy?.bundle_id ?? "unknown",
      bundle_digest: decision.policy?.revision ?? "unknown",
    },
    ...(execution !== undefined ? { context: { execution } } : {}),
    ...extra,
  };
}

export class LedgerAuditWriter implements AuditWriter {
  private readonly auditDir: string;
  private initDone = false;

  constructor(auditDir?: string) {
    this.auditDir = auditDir ?? getAuditDir();
  }

  private async ensureDir(): Promise<void> {
    if (this.initDone) return;
    await mkdir(this.auditDir, { recursive: true });
    this.initDone = true;
  }

  private segmentFile(): string {
    return join(this.auditDir, `ledger-${dateSegment()}.jsonl`);
  }

  private async append(event: Record<string, unknown>): Promise<void> {
    await this.ensureDir();
    const line = JSON.stringify(event) + "\n";
    await appendFile(this.segmentFile(), line, "utf-8");
  }

  async onDenied(ctx: AuditWriterContext, decision: PolicyDecision, detail?: unknown): Promise<void> {
    const event = buildAuditEvent(ctx, decision, "policy.decision", {
      ...(detail !== undefined ? { detail: String(detail) } : {}),
    });
    await this.append(event);
  }

  async onAllowed(ctx: AuditWriterContext, decision: PolicyDecision): Promise<void> {
    const event = buildAuditEvent(ctx, decision, "policy.decision");
    await this.append(event);
  }

  async onExecuted(
    ctx: AuditWriterContext,
    decision: PolicyDecision,
    executionResult: unknown,
  ): Promise<void> {
    const event = buildAuditEvent(ctx, decision, "tool.exec", {
      execution_outcome:
        executionResult !== null && executionResult !== undefined ? "completed" : "void",
    });
    await this.append(event);
  }
}
