import { ulid } from "ulid";

import { reactLoop, type RuntimeDeps } from "../loop/react-loop.js";
import type {
  EphemeralResult,
  ReactWorkerConfig,
  RuntimeCapabilityScope,
  SubagentRuntimePolicy,
} from "../types.js";
import { applyRuntimeCapabilityScope } from "../runtime-scope.js";

import { WorkerLifecycle } from "./lifecycle.js";

const DEFAULT_SUBAGENT_POLICY: Required<SubagentRuntimePolicy> = {
  maxTurns: 32,
  systemPreamble:
    "Operate as a bounded specialist subagent. Stay within the delegated scope, use only granted tools and skills, and return concise evidence-backed results.",
  contextMode: "filtered",
  traceHandoffs: true,
};

export interface EphemeralWorkerRunOptions {
  policy?: SubagentRuntimePolicy;
  capabilityScope?: RuntimeCapabilityScope;
}

export class EphemeralWorker {
  constructor(
    private readonly parentConfig: ReactWorkerConfig,
    private readonly policy: SubagentRuntimePolicy = {},
  ) {}

  async run(
    task: string,
    deps: RuntimeDeps,
    options: EphemeralWorkerRunOptions = {},
  ): Promise<EphemeralResult> {
    const policy = this.resolvePolicy(options.policy);
    deps.contextAssembler.setTaskPreamble(task);
    const scopedParent = applyRuntimeCapabilityScope(this.parentConfig, options.capabilityScope);
    const cfg: ReactWorkerConfig = {
      ...scopedParent,
      id: ulid(),
      parentWorkerId: this.parentConfig.id,
      maxTurns: Math.min(this.parentConfig.maxTurns, policy.maxTurns),
      systemPrompt: [this.parentConfig.systemPrompt, policy.systemPreamble].join("\n\n"),
      subagentPolicy: policy,
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
    } finally {
      deps.contextAssembler.setTaskPreamble(undefined);
    }
    return {
      workerId: cfg.id,
      ...(finalText !== undefined ? { finalText } : {}),
      ...(error !== undefined ? { error } : {}),
    };
  }

  private resolvePolicy(
    override: SubagentRuntimePolicy | undefined,
  ): Required<SubagentRuntimePolicy> {
    return {
      ...DEFAULT_SUBAGENT_POLICY,
      ...this.parentConfig.subagentPolicy,
      ...this.policy,
      ...override,
    };
  }
}
