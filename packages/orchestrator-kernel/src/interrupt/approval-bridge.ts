import type { ApprovalManager } from "@kirakira/policy-engine";
import { ulid } from "ulid";
import { createInterruptToken, validateToken } from "./interrupt-token.js";
import type { ApprovalDecision, InterruptToken, PendingAction, ResumePayload } from "../types.js";

export class ApprovalBridge {
  private readonly tickets = new Map<string, PendingAction & { ticketId: string }>();

  constructor(private readonly approvals?: ApprovalManager) {}

  requestApproval(action: PendingAction): InterruptToken {
    const ticketId = action.ticketId ?? ulid();
    this.tickets.set(ticketId, { ...action, ticketId });

    if (this.approvals) {
      void this.approvals.requestApproval({
        userId: "system",
        interactive: true,
        title: action.summary,
        risk: action.risk,
        permissions: action.permissions ?? [],
        fingerprint: {
          exact: `${action.runId}:${ticketId}:${action.nodeId ?? ""}`,
          template: `${action.runId}:${action.nodeId ?? "*"}`,
        },
        decisionId: ticketId,
      });
    }

    return createInterruptToken({
      id: ulid(),
      runId: action.runId,
      nodeId: action.nodeId ?? "approval",
      reason: `approval:${ticketId}`,
      checkpointRef: ticketId,
    });
  }

  resolveApproval(ticketId: string, decision: ApprovalDecision): ResumePayload {
    const pending = this.tickets.get(ticketId);
    this.tickets.delete(ticketId);

    if (this.approvals) {
      void this.approvals.resolveApproval(
        ticketId,
        decision === "approve" ? "approved" : "denied",
        "once",
      );
    }

    return {
      runId: pending?.runId ?? "",
      fromCheckpoint: pending?.ticketId,
      additionalContext: decision === "approve" ? "approved" : "rejected",
    };
  }

  validateIncoming(token: InterruptToken): boolean {
    return validateToken(token);
  }
}
