import { ulid } from "ulid";
import { InterruptResumeError } from "../errors.js";
import type { InterruptToken, Turn } from "../types.js";
import type { ReactWorkerState } from "../types.js";

import { deserializeWorkerState } from "./serializer.js";

export function resumeFromInterrupt(
  token: InterruptToken,
  resumePayload?: unknown,
): ReactWorkerState {
  if (token.v !== 1) {
    throw new InterruptResumeError("Unsupported interrupt token version");
  }
  const state = deserializeWorkerState(token.stateSnapshot);
  if (state.config.id !== token.workerId || state.config.runId !== token.runId) {
    throw new InterruptResumeError("Token does not match worker identity");
  }

  const resumed: ReactWorkerState = {
    ...state,
    status: "running",
    interruptRequested: false,
    interruptReason: undefined,
  };

  if (resumePayload !== undefined) {
    const content =
      typeof resumePayload === "string"
        ? resumePayload
        : JSON.stringify(resumePayload);
    const resumeTurn: Turn = {
      id: ulid(),
      seq: state.currentTurnSeq + 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      action: { kind: "final_output", output: "" },
      observation: { content: `[resume_input] ${content}`, truncated: false },
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
    resumed.turns = [...state.turns, resumeTurn];
    resumed.currentTurnSeq = resumeTurn.seq;
  }

  return resumed;
}
