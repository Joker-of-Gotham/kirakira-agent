import {
  AgentRuntime,
  type ModelPlannerClient,
  type ReactWorkerConfig,
} from "@kirakira/agent-runtime";
import type { CheckpointRepository, EventWriter } from "@kirakira/event-store";
import type {
  ControlMessage,
  RunEvent,
  RuntimeRunMode,
  RuntimeRunOptions,
} from "@kirakira/runtime-contracts";
import { ulid } from "ulid";
import { CheckpointManager } from "./checkpoint/checkpoint-manager.js";
import { DependencyResolver } from "./compiler/dependency-resolver.js";
import { GoalCompiler } from "./compiler/goal-compiler.js";
import { PlanNormalizer } from "./compiler/plan-normalizer.js";
import { ControlInbox } from "./control/control-inbox.js";
import { DrainController } from "./execution/drain.js";
import { KernelLoop } from "./execution/kernel-loop.js";
import { SubagentTaskExecutor } from "./execution/subagent-task-executor.js";
import {
  ResearchTaskExecutor,
  type DeepResearchKernelOptions,
} from "./research/research-task-executor.js";
import { SuperstepManager } from "./execution/superstep.js";
import { BackpressureController } from "./scheduler/backpressure.js";
import { LaneRouter } from "./scheduler/lane-router.js";
import { ResourceBudgetManager } from "./scheduler/resource-budget.js";
import type {
  BudgetConfig,
  DurabilityLevel,
  KernelGraphSnapshot,
  KernelState,
  LaneCapacities,
  LaneType,
  PlanContext,
  RoutingContext,
  RunEvent as KernelRunEvent,
  RuntimeSubagentBridge,
  TaskExecutor,
  TaskGraph,
  TaskNode,
  TaskResult,
} from "./types.js";

export type RunMode = RuntimeRunMode;
export type RunOptions = RuntimeRunOptions;
export type { ControlMessage };

interface RunRecord {
  runId: string;
  prompt: string;
  mode: RunMode;
  status: string;
  checkpointId?: string;
  graph: {
    totalNodes: number;
    completedNodes: number;
    runningNodes: number;
    failedNodes: number;
  };
  cost: {
    totalCostUsd: number;
    totalTokens: number;
    budgetRemainingUsd?: number;
  };
  pendingApprovals: Map<
    string,
    {
      ticketId: string;
      action: string;
      reason: string;
      requestedAt: string;
    }
  >;
  draining: boolean;
}

export interface OrchestratorKernelOptions {
  planner?: ModelPlannerClient;
  planContext?: Partial<PlanContext> | ((input: {
    prompt: string;
    mode: RunMode;
    options?: RunOptions;
  }) => PlanContext);
  fallbackExecutor?: TaskExecutor;
  subagentBridge?: RuntimeSubagentBridge;
  checkpointRepository?: CheckpointRepository;
  checkpointDurability?: DurabilityLevel;
  budgets?: Partial<BudgetConfig>;
  laneCapacities?: Partial<LaneCapacities>;
  routingContext?: Partial<RoutingContext>;
  deepResearch?: DeepResearchKernelOptions;
  parentWorkerConfig?: (input: {
    runId: string;
    prompt: string;
    mode: RunMode;
    options?: RunOptions;
  }) => ReactWorkerConfig;
}

class DeterministicPlanner implements ModelPlannerClient {
  async completeText(message: { user: string }): Promise<string> {
    let goal = "Run task";
    try {
      const parsed = JSON.parse(message.user) as { goal?: unknown };
      if (typeof parsed.goal === "string" && parsed.goal.trim().length > 0) {
        goal = parsed.goal;
      }
    } catch {
      // Fall back to a stable local plan.
    }
    return JSON.stringify({
      version: "kirakira.runplan.v1",
      goal,
      steps: [
        {
          id: "synthesize",
          description: goal,
          kind: "synthesize",
          dependsOn: [],
          canParallelize: false,
        },
      ],
      estimatedComplexity: "simple",
      requiresSubagents: false,
    });
  }
}

class LocalTaskExecutor implements TaskExecutor {
  async execute(node: TaskNode, lane: LaneType): Promise<TaskResult> {
    return {
      output: {
        nodeId: node.id,
        kind: node.kind,
        lane,
        description: node.spec.description,
      },
    };
  }
}

class LocalSubagentBridge implements RuntimeSubagentBridge {
  async run(request: Parameters<RuntimeSubagentBridge["run"]>[0]): Promise<TaskResult> {
    return {
      output: {
        parentTaskId: request.parentTaskId,
        taskBrief: request.spec.taskBrief,
      },
    };
  }
}

const DEFAULT_BUDGETS: BudgetConfig = {
  modelLimit: 1_000_000,
  sandboxSlotLimit: 8,
  mcpQpsLimit: 100,
  artifactIoLimit: 100,
};

const NOOP_CHECKPOINT_REPOSITORY: CheckpointRepository = {
  async save() {},
  async load() {
    return undefined;
  },
  async delete() {},
};

function graphSummary(graph: TaskGraph): RunRecord["graph"] {
  const nodes = [...graph.nodes.values()];
  return {
    totalNodes: nodes.length,
    completedNodes: nodes.filter((node) => node.status === "completed").length,
    runningNodes: nodes.filter((node) => node.status === "running").length,
    failedNodes: nodes.filter((node) => node.status === "failed").length,
  };
}

function resultPreview(result: TaskResult): string | undefined {
  if (typeof result.output === "string") return result.output.slice(0, 240);
  try {
    return JSON.stringify(result.output).slice(0, 240);
  } catch {
    return undefined;
  }
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : undefined;
}

function graphFromSnapshot(snapshot: KernelGraphSnapshot): TaskGraph {
  return {
    id: snapshot.id,
    runId: snapshot.runId,
    rootNodeId: snapshot.rootNodeId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    edges: snapshot.edges,
    nodes: new Map(Object.entries(snapshot.nodes)),
  };
}

export class OrchestratorKernel {
  private readonly writer: EventWriter;
  private readonly runtime: AgentRuntime;
  private readonly options: OrchestratorKernelOptions;
  private readonly runs = new Map<string, RunRecord>();
  private readonly graphs = new Map<string, TaskGraph>();
  private readonly parentWorkerIds = new Map<string, string>();
  private readonly eventHandlers = new Set<(event: RunEvent) => void>();
  private drainWaiters: (() => void)[] = [];
  private started = false;

  constructor(writer: EventWriter, options: OrchestratorKernelOptions = {}) {
    this.writer = writer;
    this.options = options;
    this.runtime = new AgentRuntime((e) => {
      this.append(e);
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
  }

  async stop(): Promise<void> {
    this.started = false;
    for (const runId of [...this.runs.keys()]) {
      this.runtime.removeRunWorkers(runId);
    }
    this.runs.clear();
    this.graphs.clear();
    this.parentWorkerIds.clear();
    this.writer.close();
  }

  getRuntime(): AgentRuntime {
    return this.runtime;
  }

  getWriter(): EventWriter {
    return this.writer;
  }

  onEvent(handler: (event: RunEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  private broadcastHandlers(event: RunEvent): void {
    for (const h of this.eventHandlers) {
      try {
        h(event);
      } catch {
        /* ignore handler errors */
      }
    }
  }

  private emit(runId: string, kind: RunEvent["kind"], payload: Record<string, unknown>): void {
    const event: RunEvent = {
      id: ulid(),
      runId,
      timestamp: new Date().toISOString(),
      kind,
      payload,
    };
    this.append(event);
  }

  private append(event: RunEvent): void {
    this.writer.append(event);
    this.broadcastHandlers(event);
  }

  private parentWorkerConfig(
    runId: string,
    prompt: string,
    mode: RunMode,
    options?: RunOptions,
  ): ReactWorkerConfig {
    if (this.options.parentWorkerConfig) {
      return this.options.parentWorkerConfig({ runId, prompt, mode, options });
    }
    return {
      id: `${runId}-supervisor`,
      runId,
      workloadType: "supervisor",
      model: "default",
      systemPrompt: "Kirakira daemon supervisor",
      contextBudget: {
        maxTokens: 16_384,
        reservedForOutput: 2_048,
        toolSchemaAllocation: 2_048,
        skillHintAllocation: 2_048,
        historyAllocation: 10_240,
      },
      maxTurns: 12,
      ...(options?.budgetUsd !== undefined ? { costBudgetUsd: options.budgetUsd } : {}),
    };
  }

  private planContext(prompt: string, mode: RunMode, options?: RunOptions): PlanContext {
    const configured = this.options.planContext;
    if (typeof configured === "function") {
      return configured({ prompt, mode, options });
    }
    const metadata = options?.metadata ?? {};
    return {
      workspace: options?.workspaceRoot ?? ".",
      availableTools: stringArray(metadata.availableTools) ?? [],
      availableSkills: stringArray(metadata.availableSkills) ?? [],
      availableMcpServers: stringArray(metadata.availableMcpServers) ?? [],
      constraints: stringArray(metadata.constraints),
      ...(configured ?? {}),
    };
  }

  private createKernelLoop(
    runId: string,
    parentConfig: ReactWorkerConfig,
    workspaceRoot: string,
    traceId: string,
  ): KernelLoop {
    const fallback = this.options.fallbackExecutor ?? new LocalTaskExecutor();
    const bridge = this.options.subagentBridge ?? new LocalSubagentBridge();
    const researchExecutor = new ResearchTaskExecutor({
      ...(this.options.deepResearch ?? {}),
      getContext: () => ({
        runId,
        parentWorkerId: parentConfig.id,
        workspaceRoot,
        traceId,
      }),
      fallback,
      emit: (kind, payload) => this.emit(runId, kind, payload),
    });
    const executor = new SubagentTaskExecutor({
      bridge,
      getContext: () => ({
        runId,
        parentConfig,
        parentWorkerId: parentConfig.id,
        workspaceRoot,
        traceId,
      }),
      fallback: researchExecutor,
    });
    return new KernelLoop({
      normalizer: new PlanNormalizer(),
      resolver: new DependencyResolver(),
      executor,
      laneRouter: new LaneRouter(),
      budgetManager: new ResourceBudgetManager({
        ...DEFAULT_BUDGETS,
        ...(this.options.budgets ?? {}),
      }),
      backpressure: new BackpressureController(),
      checkpointManager: this.createCheckpointManager(),
      inbox: new ControlInbox(),
      superstep: new SuperstepManager(),
      drain: new DrainController(),
      routingContext: {
        interactive: false,
        ...(this.options.routingContext ?? {}),
      },
      laneCapacities: this.options.laneCapacities,
    });
  }

  private createCheckpointManager(): CheckpointManager {
    return new CheckpointManager(
      this.options.checkpointRepository ?? NOOP_CHECKPOINT_REPOSITORY,
      this.options.checkpointDurability ?? "async",
    );
  }

  private graphPayload(graph: TaskGraph): Record<string, unknown> {
    const summary = graphSummary(graph);
    return {
      graphId: graph.id,
      runId: graph.runId,
      rootNodeId: graph.rootNodeId,
      ...summary,
      nodes: [...graph.nodes.values()].map((node) => ({
        id: node.id,
        kind: node.kind,
        status: node.status,
        description: node.spec.description,
        ...(node.assignedWorkerId !== undefined ? { workerId: node.assignedWorkerId } : {}),
        ...(node.error !== undefined ? { error: node.error } : {}),
      })),
      edges: graph.edges.map((edge, index) => ({
        id: `${edge.from}:${edge.to}:${edge.kind}:${index}`,
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
      })),
    };
  }

  private taskPayload(
    runId: string,
    event: Extract<KernelRunEvent, { kind: "task_started" | "task_completed" | "task_failed" }>,
  ): Record<string, unknown> {
    const node = this.graphs.get(runId)?.nodes.get(event.nodeId);
    return {
      taskId: event.nodeId,
      nodeId: event.nodeId,
      ...(node !== undefined ? { kind: node.kind, description: node.spec.description } : {}),
      ...(event.kind === "task_started" ? { workerId: event.workerId, lane: event.lane } : {}),
      ...(event.kind === "task_completed"
        ? {
            result: event.result,
            preview: resultPreview(event.result),
            artifactRefs: event.result.artifactRefs,
          }
        : {}),
      ...(event.kind === "task_failed" ? { error: event.error } : {}),
    };
  }

  private subagentPayload(
    runId: string,
    event: Extract<KernelRunEvent, { kind: "task_started" | "task_completed" | "task_failed" }>,
  ): Record<string, unknown> | null {
    const node = this.graphs.get(runId)?.nodes.get(event.nodeId);
    if (!node || node.kind !== "subagent") return null;
    const contract = node.spec.subagent;
    return {
      subagentId: event.nodeId,
      parentTaskId: event.nodeId,
      parentWorkerId: this.parentWorkerIds.get(runId),
      ...(event.kind === "task_started" ? { workerId: event.workerId, lane: event.lane } : {}),
      ...(contract !== undefined
        ? {
            taskPreview: contract.taskBrief,
            capabilities: contract.capabilities,
            modelPreference: contract.modelPreference,
            runtimePolicy: contract.runtimePolicy,
            policyCeiling: contract.policyCeiling,
            inputArtifactRefs: contract.inputArtifactRefs,
            outputSchema: contract.outputSchema,
          }
        : {}),
      ...(event.kind === "task_completed"
        ? {
            status: "completed",
            result: event.result,
            preview: resultPreview(event.result),
            artifactRefs: event.result.artifactRefs,
          }
        : {}),
      ...(event.kind === "task_failed" ? { status: "failed", error: event.error } : {}),
    };
  }

  private updateGraphOnTaskStart(runId: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.graph = {
      ...run.graph,
      runningNodes: run.graph.runningNodes + 1,
    };
  }

  private updateGraphOnTaskEnd(runId: string, status: "completed" | "failed"): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.graph = {
      ...run.graph,
      runningNodes: Math.max(0, run.graph.runningNodes - 1),
      completedNodes: status === "completed" ? run.graph.completedNodes + 1 : run.graph.completedNodes,
      failedNodes: status === "failed" ? run.graph.failedNodes + 1 : run.graph.failedNodes,
    };
  }

  private applyKernelEvent(runId: string, event: KernelRunEvent): void {
    const run = this.runs.get(runId);
    switch (event.kind) {
      case "plan_attached":
        this.emit(runId, "plan.compiled", {
          planId: event.plan.id,
          goal: event.plan.goal,
          stepCount: event.plan.steps.length,
          estimatedComplexity: event.plan.estimatedComplexity,
          requiresSubagents: event.plan.requiresSubagents,
          plan: event.plan as unknown as Record<string, unknown>,
        });
        break;
      case "graph_normalized":
        this.graphs.set(runId, event.graph);
        if (run) run.graph = graphSummary(event.graph);
        this.emit(runId, "graph.normalized", this.graphPayload(event.graph));
        break;
      case "task_started": {
        this.updateGraphOnTaskStart(runId);
        this.emit(runId, "task.started", this.taskPayload(runId, event));
        const subagent = this.subagentPayload(runId, event);
        if (subagent) this.emit(runId, "subagent.spawned", subagent);
        break;
      }
      case "task_completed": {
        this.updateGraphOnTaskEnd(runId, "completed");
        this.emit(runId, "task.completed", this.taskPayload(runId, event));
        const subagent = this.subagentPayload(runId, event);
        if (subagent) this.emit(runId, "subagent.completed", subagent);
        break;
      }
      case "task_failed": {
        this.updateGraphOnTaskEnd(runId, "failed");
        this.emit(runId, "task.failed", this.taskPayload(runId, event));
        const subagent = this.subagentPayload(runId, event);
        if (subagent) this.emit(runId, "subagent.completed", subagent);
        break;
      }
      case "checkpoint_saved":
        if (run) run.checkpointId = event.checkpointId;
        this.emit(runId, "checkpoint.saved", { checkpointId: event.checkpointId });
        break;
      case "superstep_boundary":
        this.emit(runId, "graph.normalized", { superstepBoundary: true });
        break;
      case "run_completed":
        this.graphs.set(runId, event.graph);
        if (run) {
          run.status = "completed";
          run.graph = graphSummary(event.graph);
        }
        this.runtime.removeRunWorkers(runId);
        this.parentWorkerIds.delete(runId);
        this.emit(runId, "graph.normalized", this.graphPayload(event.graph));
        this.emit(runId, "run.completed", {
          graphId: event.graph.id,
          ...graphSummary(event.graph),
        });
        this.flushDrainIfIdle();
        break;
      case "run_failed":
        if (run) run.status = "failed";
        this.emit(runId, "run.failed", {
          code: event.code,
          message: event.message,
          ...(event.nodeId !== undefined ? { nodeId: event.nodeId } : {}),
        });
        this.flushDrainIfIdle();
        break;
    }
  }

  private async executeGraphRun(
    runId: string,
    prompt: string,
    mode: RunMode,
    options: RunOptions | undefined,
    parentConfig: ReactWorkerConfig,
  ): Promise<void> {
    try {
      const context = this.planContext(prompt, mode, options);
      const compiler = new GoalCompiler(this.options.planner ?? new DeterministicPlanner());
      const plan = await compiler.compile(prompt, context);
      const loop = this.createKernelLoop(
        runId,
        parentConfig,
        context.workspace,
        `run:${runId}`,
      );
      for await (const event of loop.run(runId, plan)) {
        this.applyKernelEvent(runId, event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const run = this.runs.get(runId);
      if (run) run.status = "failed";
      this.emit(runId, "run.failed", { message });
      this.runtime.removeRunWorkers(runId);
      this.parentWorkerIds.delete(runId);
      this.flushDrainIfIdle();
    }
  }

  private async restoreCheckpointRun(
    runId: string,
    fromCheckpoint?: string,
  ): Promise<void> {
    const existing = this.runs.get(runId);
    const checkpointId = fromCheckpoint ?? existing?.checkpointId;
    if (!checkpointId) {
      if (existing) {
        existing.status = "running";
        this.emit(runId, "interrupt.resumed", {});
      }
      return;
    }

    try {
      const state: KernelState = await this.createCheckpointManager().restore(checkpointId);
      if (state.runId !== runId) {
        this.emit(runId, "run.failed", {
          message: `Checkpoint ${checkpointId} belongs to run ${state.runId}`,
        });
        return;
      }
      const graph = graphFromSnapshot(state.graph);
      const run = existing ?? this.defaultRun("Restored from checkpoint", "headless");
      run.runId = runId;
      run.status = "running";
      run.checkpointId = checkpointId;
      run.graph = graphSummary(graph);
      this.runs.set(runId, run);
      this.graphs.set(runId, graph);
      this.emit(runId, "checkpoint.restored", {
        checkpointId,
        planId: state.planId,
        graphId: graph.id,
        ...graphSummary(graph),
      });
      this.emit(runId, "graph.normalized", this.graphPayload(graph));
      this.emit(runId, "interrupt.resumed", { fromCheckpoint: checkpointId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const run = existing ?? this.defaultRun("Failed checkpoint restore", "headless");
      run.runId = runId;
      run.status = "failed";
      this.runs.set(runId, run);
      this.emit(runId, "run.failed", { message });
      this.flushDrainIfIdle();
    }
  }

  private defaultRun(prompt: string, mode: RunMode): RunRecord {
    return {
      runId: "",
      prompt,
      mode,
      status: "pending",
      graph: {
        totalNodes: 0,
        completedNodes: 0,
        runningNodes: 0,
        failedNodes: 0,
      },
      cost: { totalCostUsd: 0, totalTokens: 0 },
      pendingApprovals: new Map(),
      draining: false,
    };
  }

  async submitRun(prompt: string, mode: RunMode, options?: RunOptions): Promise<string> {
    const runId = ulid();
    const rec = this.defaultRun(prompt, mode);
    rec.runId = runId;
    rec.status = "running";
    if (options?.budgetUsd !== undefined) {
      rec.cost.budgetRemainingUsd = options.budgetUsd;
    }
    this.runs.set(runId, rec);
    this.emit(runId, "run.created", {
      prompt,
      mode,
      ...(options?.workspaceRoot !== undefined ? { workspaceRoot: options.workspaceRoot } : {}),
    });
    this.emit(runId, "run.started", {
      prompt,
      mode,
      ...(options?.workspaceRoot !== undefined ? { workspaceRoot: options.workspaceRoot } : {}),
    });
    const parentConfig = this.parentWorkerConfig(runId, prompt, mode, options);
    this.parentWorkerIds.set(runId, parentConfig.id);
    this.runtime.registerWorker({
      id: parentConfig.id,
      runId,
      workloadType: parentConfig.workloadType,
      status: "active",
      turnCount: 0,
      model: parentConfig.model,
    });
    void this.executeGraphRun(runId, prompt, mode, options, parentConfig);
    return runId;
  }

  forwardControl(message: ControlMessage): void {
    switch (message.type) {
      case "submit": {
        void this.submitRun(message.prompt, message.mode, message.options);
        break;
      }
      case "steer": {
        const wId = this.parentWorkerIds.get(message.runId) ?? `${message.runId}-supervisor`;
        try {
          const cur = this.runtime.getWorkerStatus(wId);
          this.runtime.updateWorker(wId, { turnCount: cur.turnCount + 1 });
        } catch {
          return;
        }
        this.emit(message.runId, "steer.received", {
          instruction: message.instruction,
          ...(message.priority !== undefined ? { priority: message.priority } : {}),
        });
        break;
      }
      case "enqueue": {
        const rid = message.runId ?? ulid();
        if (!this.runs.has(rid)) {
          const rec = this.defaultRun(message.prompt, "headless");
          rec.runId = rid;
          rec.status = "pending";
          this.runs.set(rid, rec);
        }
        this.emit(rid, "plan.compiled", {
          prompt: message.prompt,
          priority: message.priority ?? 0,
          enqueued: true,
        });
        break;
      }
      case "approve": {
        const r = this.runs.get(message.runId);
        if (!r) return;
        r.pendingApprovals.delete(message.ticketId);
        this.emit(message.runId, "approval.resolved", {
          ticketId: message.ticketId,
          decision: message.decision,
          ...(message.reason !== undefined ? { reason: message.reason } : {}),
        });
        break;
      }
      case "provide_input": {
        this.emit(message.runId, "interrupt.resumed", {
          interruptId: message.interruptId,
          data: message.data,
        } as Record<string, unknown>);
        break;
      }
      case "drain": {
        for (const r of this.runs.values()) {
          r.draining = true;
        }
        for (const rid of this.runs.keys()) {
          this.emit(rid, "drain.requested", {});
        }
        this.flushDrainIfIdle();
        break;
      }
      case "cancel": {
        const r = this.runs.get(message.runId);
        if (!r) return;
        r.status = "drained";
        this.emit(message.runId, "run.drained", { reason: message.reason ?? "cancelled" });
        this.runtime.removeRunWorkers(message.runId);
        this.parentWorkerIds.delete(message.runId);
        this.flushDrainIfIdle();
        break;
      }
      case "resume": {
        void this.restoreCheckpointRun(message.runId, message.fromCheckpoint);
        break;
      }
      case "inspect": {
        const r = this.runs.get(message.runId);
        if (!r) return;
        this.emit(message.runId, "graph.normalized", {
          totalNodes: r.graph.totalNodes,
          completedNodes: r.graph.completedNodes,
          runningNodes: r.graph.runningNodes,
          failedNodes: r.graph.failedNodes,
          inspect: true,
          includeEvents: message.includeEvents ?? false,
        });
        break;
      }
    }
  }

  private flushDrainIfIdle(): void {
    const active = [...this.runs.values()].filter(
      (r) => r.status === "running" || r.status === "pending",
    );
    if (active.length > 0) return;
    const waiters = this.drainWaiters.splice(0, this.drainWaiters.length);
    for (const w of waiters) w();
  }

  async waitForDrain(): Promise<void> {
    const active = [...this.runs.values()].filter(
      (r) => r.status === "running" || r.status === "pending",
    );
    if (active.length === 0) return;
    await new Promise<void>((resolve) => {
      this.drainWaiters.push(resolve);
    });
  }

  getStateSnapshot(runId: string): {
    runId: string;
    status: string;
    graph?: RunRecord["graph"];
    checkpointId?: string;
  } | null {
    const r = this.runs.get(runId);
    if (!r) return null;
    return {
      runId: r.runId,
      status: r.status,
      graph: { ...r.graph },
      checkpointId: r.checkpointId,
    };
  }

  snapshotRunForDaemon(runId: string): {
    run: RunRecord | null;
    workers: ReturnType<AgentRuntime["listActiveWorkers"]>;
    approvals: Array<{
      ticketId: string;
      action: string;
      reason: string;
      requestedAt: string;
    }>;
  } {
    const run = this.runs.get(runId) ?? null;
    const parentWorkerId = this.parentWorkerIds.get(runId);
    const workers = this.runtime
      .listActiveWorkers()
      .filter((w) => w.id === parentWorkerId || w.id.startsWith(`${runId}-`));
    const approvals = run ? [...run.pendingApprovals.values()] : [];
    return { run, workers, approvals };
  }

  addPendingApproval(runId: string, ticketId: string, action: string, reason: string): void {
    const r = this.runs.get(runId);
    if (!r) return;
    const requestedAt = new Date().toISOString();
    r.pendingApprovals.set(ticketId, {
      ticketId,
      action,
      reason,
      requestedAt,
    });
    this.emit(runId, "approval.requested", {
      ticketId,
      action,
      reason,
    });
  }

  saveCheckpoint(runId: string, checkpointId: string): void {
    const r = this.runs.get(runId);
    if (!r) return;
    r.checkpointId = checkpointId;
    this.emit(runId, "checkpoint.saved", { checkpointId });
    this.flushDrainIfIdle();
  }
}
