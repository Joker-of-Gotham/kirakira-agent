import { ulid } from "ulid";

import { reactLoop, type RuntimeDeps } from "../loop/react-loop.js";
import type { EphemeralResult, ReactWorkerConfig } from "../types.js";

import { WorkerLifecycle } from "./lifecycle.js";

export class EphemeralWorker {
  constructor(private readonly parentConfig: ReactWorkerConfig) {}

  async run(task: string, deps: RuntimeDeps): Promise<EphemeralResult> {
    deps.contextAssembler.setTaskPreamble(task);
    const cfg: ReactWorkerConfig = {
      ...this.parentConfig,
      id: ulid(),
      parentWorkerId: this.parentConfig.id,
      maxTurns: Math.min(this.parentConfig.maxTurns, 32),
      systemPrompt: `${this.parentConfig.systemPrompt}

You are a subagent; answer succinctly.`,
    };
    const lifecycle = WorkerLifecycle.create(cfg);
    let state = WorkerLifecycle.start(lifecycle);
    let finalText: string | undefined;
    let error: string | undefined;
    try {
      for await (const ev of reactLoop(state, deps)) {
        if (ev.kind === "run.completed" && typeof ev.payload.output === "string") {
          finalText = ev.payload.output;
        }
        if (ev.kind === "run.failed") {
          error = String(
            (ev.payload as { error?: unknown }).error ?? "failed",
          );
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    return {
      workerId: cfg.id,
      ...(finalText !== undefined ? { finalText } : {}),
      ...(error !== undefined ? { error } : {}),
    };
  }
}
