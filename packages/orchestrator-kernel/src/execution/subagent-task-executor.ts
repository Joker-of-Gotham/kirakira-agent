import type { ReactWorkerConfig } from "@kirakira/agent-runtime";
import { subagentSpecFromTaskNode } from "../subagent/contract.js";
import type {
  LaneType,
  RuntimeSubagentBridge,
  TaskExecutor,
  TaskNode,
  TaskResult,
} from "../types.js";

export interface RuntimeTaskExecutionContext {
  runId: string;
  workspaceRoot: string;
  parentConfig: ReactWorkerConfig;
  parentWorkerId?: string;
  traceId?: string;
}

export interface SubagentTaskExecutorDeps {
  bridge: RuntimeSubagentBridge;
  getContext: (node: TaskNode) => RuntimeTaskExecutionContext;
  fallback: TaskExecutor;
}

export class SubagentTaskExecutor implements TaskExecutor {
  constructor(private readonly deps: SubagentTaskExecutorDeps) {}

  async execute(node: TaskNode, lane: LaneType): Promise<TaskResult> {
    if (node.kind !== "subagent") return this.deps.fallback.execute(node, lane);

    const context = this.deps.getContext(node);
    const parentWorkerId = context.parentWorkerId ?? context.parentConfig.id;
    const spec = subagentSpecFromTaskNode(node, {
      runId: context.runId,
      parentWorkerId,
      workspaceRoot: context.workspaceRoot,
      ...(context.traceId !== undefined ? { traceId: context.traceId } : {}),
    });

    return this.deps.bridge.run({
      runId: context.runId,
      parentTaskId: node.id,
      parentWorkerId,
      parentConfig: context.parentConfig,
      workspaceRoot: context.workspaceRoot,
      spec,
      lane,
    });
  }
}
