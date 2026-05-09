import { ulid } from "ulid";

import type { RunEvent } from "@kirakira/event-store";

import type { WorkerState as DaemonWorkerState, WorkerSummary } from "./types.js";

function emit(
  sink: (event: RunEvent) => void,
  runId: string,
  kind: RunEvent["kind"],
  payload: RunEvent["payload"],
): void {
  sink({
    id: ulid(),
    runId,
    timestamp: new Date().toISOString(),
    kind,
    payload,
  });
}

export class AgentRuntime {
  private readonly workers = new Map<string, DaemonWorkerState>();

  constructor(private readonly sink: (event: RunEvent) => void) {}

  registerWorker(state: DaemonWorkerState): void {
    this.workers.set(state.id, { ...state });
    emit(this.sink, state.runId, "subagent.spawned", {
      workerId: state.id,
      workloadType: state.workloadType,
      status: state.status,
      turnCount: state.turnCount,
      model: state.model,
    });
  }

  updateWorker(workerId: string, partial: Partial<DaemonWorkerState>): void {
    const cur = this.workers.get(workerId);
    if (!cur) return;
    const next = { ...cur, ...partial, id: cur.id };
    this.workers.set(workerId, next);
    emit(this.sink, next.runId, "task.started", {
      workerId: next.id,
      workloadType: next.workloadType,
      status: next.status,
      turnCount: next.turnCount,
      model: next.model,
    });
  }

  getWorkerStatus(workerId: string): DaemonWorkerState {
    const w = this.workers.get(workerId);
    if (!w) {
      throw new Error(`Unknown worker: ${workerId}`);
    }
    return { ...w };
  }

  listActiveWorkers(): WorkerSummary[] {
    return [...this.workers.values()]
      .filter((w) => w.status !== "terminated")
      .map((w) => ({
        id: w.id,
        workloadType: w.workloadType,
        status: w.status,
        turnCount: w.turnCount,
        model: w.model,
      }));
  }

  async terminateWorker(workerId: string): Promise<void> {
    const w = this.workers.get(workerId);
    if (!w) return;
    this.workers.delete(workerId);
    emit(this.sink, w.runId, "task.completed", {
      workerId: w.id,
      status: "terminated",
      workloadType: w.workloadType,
      turnCount: w.turnCount,
      model: w.model,
    });
  }

  removeRunWorkers(runId: string): void {
    for (const [id, w] of [...this.workers.entries()]) {
      if (w.runId === runId) this.workers.delete(id);
    }
  }
}
