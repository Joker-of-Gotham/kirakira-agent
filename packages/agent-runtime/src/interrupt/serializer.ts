import type { ReactWorkerState, SerializedWorkerState } from "../types.js";

export function serializeWorkerState(state: ReactWorkerState): string {
  const payload: SerializedWorkerState = { ...state, __serialized: true };
  return JSON.stringify(payload);
}

export function deserializeWorkerState(data: string): ReactWorkerState {
  const raw = JSON.parse(data) as Record<string, unknown> & { __serialized?: boolean };
  if (raw.__serialized !== true) {
    throw new Error("Invalid worker state payload");
  }
  const { __serialized: _s, ...rest } = raw;
  void _s;
  return rest as unknown as ReactWorkerState;
}
