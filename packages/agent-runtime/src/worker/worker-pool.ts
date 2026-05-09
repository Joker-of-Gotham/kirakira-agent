import PQueue from "p-queue";

import type { ReactWorkerConfig, ReactWorkerState } from "../types.js";

import { WorkerLifecycle } from "./lifecycle.js";

export class WorkerPool {
  private readonly queue: PQueue;
  private readonly workers = new Map<string, ReactWorkerState>();

  constructor(concurrency = 4) {
    this.queue = new PQueue({ concurrency });
  }

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(() => fn()) as Promise<T>;
  }

  async spawn(config: ReactWorkerConfig): Promise<string> {
    const id = config.id;
    const initial = WorkerLifecycle.start(WorkerLifecycle.create(config));
    this.workers.set(id, initial);
    return id;
  }

  getStatus(workerId: string): ReactWorkerState {
    const s = this.workers.get(workerId);
    if (!s) {
      throw new Error(`Unknown worker: ${workerId}`);
    }
    return s;
  }

  update(workerId: string, state: ReactWorkerState): void {
    this.workers.set(workerId, state);
  }

  async terminate(workerId: string): Promise<void> {
    const s = this.workers.get(workerId);
    if (!s) return;
    this.workers.set(workerId, { ...s, status: "completed" });
  }

  listActive(): ReactWorkerState[] {
    return [...this.workers.values()].filter(
      (w) => w.status === "running" || w.status === "waiting_approval",
    );
  }
}
