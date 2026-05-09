import { ulid } from "ulid";

import type { ReactWorkerState } from "../types.js";
import type { InterruptToken } from "../types.js";

import { serializeWorkerState } from "./serializer.js";

export class InterruptHandler {
  private requested = false;
  private reason?: string;

  requestInterrupt(r: string): void {
    this.requested = true;
    this.reason = r;
  }

  checkInterrupt(state: ReactWorkerState): boolean {
    return this.requested || state.interruptRequested === true;
  }

  consumeReason(): string | undefined {
    const r = this.reason;
    this.reason = undefined;
    return r;
  }

  reset(): void {
    this.requested = false;
    this.reason = undefined;
  }

  createToken(state: ReactWorkerState): InterruptToken {
    return {
      v: 1,
      tokenId: ulid(),
      workerId: state.config.id,
      runId: state.config.runId,
      issuedAt: new Date().toISOString(),
      reason: state.interruptReason ?? this.reason,
      stateSnapshot: serializeWorkerState(state),
    };
  }
}
