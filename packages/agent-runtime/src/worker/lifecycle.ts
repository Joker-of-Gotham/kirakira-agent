import type { ReactWorkerConfig, ReactWorkerState } from "../types.js";

const DEFAULT_TIMEOUT_MS = 3_600_000;

export class WorkerLifecycle {
  static create(config: ReactWorkerConfig): ReactWorkerState {
    return {
      config,
      turns: [],
      currentTurnSeq: 0,
      totalTokensUsed: 0,
      totalCostUsd: 0,
      status: "initializing",
      artifacts: [],
    };
  }

  static start(state: ReactWorkerState): ReactWorkerState {
    return { ...state, status: "running" };
  }

  static complete(state: ReactWorkerState): ReactWorkerState {
    return { ...state, status: "completed" };
  }

  static fail(state: ReactWorkerState, error: Error): ReactWorkerState {
    return {
      ...state,
      status: "failed",
      interruptReason: error.message,
    };
  }

  static withTimeout(state: ReactWorkerState, _deadlineMs: number = DEFAULT_TIMEOUT_MS): ReactWorkerState {
    void _deadlineMs;
    return state;
  }
}
