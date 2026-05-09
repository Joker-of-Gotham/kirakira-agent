import { ulid } from "ulid";
import { OrchestratorKernelError } from "../errors.js";
import type { Action, Intent, Receipt } from "../types.js";

export class CommittedActionLog {
  private readonly intents = new Map<string, Intent>();

  logIntent(action: Action): string {
    const intentId = `intent_${ulid()}`;
    const intent: Intent = {
      intentId,
      action,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    this.intents.set(intentId, intent);
    return intentId;
  }

  confirmExecution(intentId: string, receipt: Receipt): void {
    const cur = this.intents.get(intentId);
    if (!cur) throw new OrchestratorKernelError("INTENT", `Unknown intent: ${intentId}`);
    this.intents.set(intentId, { ...cur, status: "confirmed", receipt });
  }

  abortIntent(intentId: string, reason?: string): void {
    const cur = this.intents.get(intentId);
    if (!cur) throw new OrchestratorKernelError("INTENT", `Unknown intent: ${intentId}`);
    if (cur.status !== "pending") {
      throw new OrchestratorKernelError("INTENT", `Cannot abort non-pending intent: ${intentId}`);
    }
    this.intents.set(intentId, {
      ...cur,
      status: "aborted",
      receipt: {
        ok: false,
        result: reason ?? "aborted",
        executedAt: new Date().toISOString(),
      },
    });
  }

  getPendingIntents(): Intent[] {
    return [...this.intents.values()].filter((i) => i.status === "pending");
  }
}
