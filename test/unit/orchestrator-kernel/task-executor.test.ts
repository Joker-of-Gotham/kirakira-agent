import { describe, expect, it } from "vitest";
import type { ReactWorkerConfig } from "../../../packages/agent-runtime/src/index.js";
import { CheckpointManager } from "../../../packages/orchestrator-kernel/src/checkpoint/checkpoint-manager.js";
import { DependencyResolver } from "../../../packages/orchestrator-kernel/src/compiler/dependency-resolver.js";
import { PlanNormalizer } from "../../../packages/orchestrator-kernel/src/compiler/plan-normalizer.js";
import { ControlInbox } from "../../../packages/orchestrator-kernel/src/control/control-inbox.js";
import { DrainController } from "../../../packages/orchestrator-kernel/src/execution/drain.js";
import { KernelLoop } from "../../../packages/orchestrator-kernel/src/execution/kernel-loop.js";
import { SubagentTaskExecutor } from "../../../packages/orchestrator-kernel/src/execution/subagent-task-executor.js";
import { SuperstepManager } from "../../../packages/orchestrator-kernel/src/execution/superstep.js";
import { BackpressureController } from "../../../packages/orchestrator-kernel/src/scheduler/backpressure.js";
import { LaneRouter } from "../../../packages/orchestrator-kernel/src/scheduler/lane-router.js";
import { ResourceBudgetManager } from "../../../packages/orchestrator-kernel/src/scheduler/resource-budget.js";
import type {
  PlanContext,
  RuntimeSubagentBridgeRequest,
  RunPlan,
  TaskExecutor,
} from "../../../packages/orchestrator-kernel/src/index.js";

const context: PlanContext = {
  workspace: "C:/workspace",
  availableTools: ["web.search", "repo.read"],
  availableSkills: ["research", "review"],
  availableMcpServers: ["filesystem"],
};

function basePlan(overrides: Partial<RunPlan> = {}): RunPlan {
  return {
    id: "plan-1",
    goal: "research safely",
    context,
    estimatedComplexity: "complex",
    requiresSubagents: true,
    steps: [
      {
        id: "step-a",
        kind: "subagent",
        description: "Inspect the repo",
        dependsOn: [],
        canParallelize: true,
        toolScope: ["repo.read"],
        skillScope: ["research"],
        mcpServers: ["filesystem"],
        inputArtifactRefs: ["artifact-source"],
        model: "openai:gpt-5.4",
        subagent: {
          taskBrief: "Inspect repo architecture",
          runtimePolicy: { maxTurns: 8, contextMode: "filtered" },
          outputSchema: {
            type: "object",
            properties: { summary: { type: "string" } },
          },
          policyCeiling: {
            network: "restricted",
            filesystemWrite: "ask",
            shell: "deny",
          },
        },
      },
    ],
    ...overrides,
  };
}

function parentConfig(overrides: Partial<ReactWorkerConfig> = {}): ReactWorkerConfig {
  return {
    id: "worker-parent",
    runId: "run-1",
    workloadType: "supervisor",
    model: "openai:gpt-5.4",
    systemPrompt: "parent",
    contextBudget: {
      maxTokens: 4096,
      reservedForOutput: 512,
      toolSchemaAllocation: 512,
      skillHintAllocation: 512,
      historyAllocation: 2048,
    },
    maxTurns: 12,
    ...overrides,
  };
}

function fallbackExecutor(): TaskExecutor {
  return {
    async execute(node) {
      return { output: `${node.kind}:${node.id}` };
    },
  };
}

function kernelExecutorDeps(executor: TaskExecutor) {
  return {
    normalizer: new PlanNormalizer(),
    resolver: new DependencyResolver(),
    executor,
    laneRouter: new LaneRouter(),
    budgetManager: new ResourceBudgetManager({
      modelLimit: 1_000_000,
      sandboxSlotLimit: 8,
      mcpQpsLimit: 100,
      artifactIoLimit: 100,
    }),
    backpressure: new BackpressureController(),
    checkpointManager: new CheckpointManager(
      {
        async save() {},
        async load() {
          return null;
        },
      },
      "exit",
    ),
    inbox: new ControlInbox(),
    superstep: new SuperstepManager(),
    drain: new DrainController(),
    routingContext: { interactive: false },
  };
}

describe("orchestrator task executor", () => {
  it("executes a normalized subagent task through the runtime bridge", async () => {
    const graph = new PlanNormalizer().normalize(basePlan(), "run-1");
    const node = graph.nodes.get("step-a");
    if (!node) throw new Error("missing node");
    let captured: RuntimeSubagentBridgeRequest | undefined;
    const executor = new SubagentTaskExecutor({
      bridge: {
        async run(request) {
          captured = request;
          return {
            output: "child output",
            artifactRefs: ["artifact-a"],
          };
        },
      },
      getContext: () => ({
        runId: "run-1",
        parentWorkerId: "worker-parent",
        parentConfig: parentConfig(),
        workspaceRoot: "C:/workspace",
        traceId: "trace-1",
      }),
      fallback: fallbackExecutor(),
    });

    const result = await executor.execute(node, "delegated");

    expect(result).toEqual({
      output: "child output",
      artifactRefs: ["artifact-a"],
    });
    expect(captured).toMatchObject({
      runId: "run-1",
      parentTaskId: "step-a",
      parentWorkerId: "worker-parent",
      workspaceRoot: "C:/workspace",
      lane: "delegated",
      spec: {
        taskBrief: "Inspect repo architecture",
        parentTaskId: "step-a",
        parentWorkerId: "worker-parent",
        traceId: "trace-1",
        capabilities: [
          { kind: "tool", name: "repo.read" },
          { kind: "skill", name: "research" },
          { kind: "mcp", name: "filesystem" },
        ],
        modelPreference: "openai:gpt-5.4",
        runtimePolicy: { maxTurns: 8, contextMode: "filtered" },
        policyCeiling: {
          network: "restricted",
          filesystemWrite: "ask",
          shell: "deny",
        },
        inputArtifactRefs: ["artifact-source"],
        outputSchema: {
          type: "object",
          properties: { summary: { type: "string" } },
        },
      },
    });
  });

  it("passes the parent worker config through unchanged without role hardcoding", async () => {
    const graph = new PlanNormalizer().normalize(basePlan(), "run-1");
    const node = graph.nodes.get("step-a");
    if (!node) throw new Error("missing node");
    const parent = parentConfig({ id: "review-worker", workloadType: "reviewer" });
    let captured: RuntimeSubagentBridgeRequest | undefined;
    const executor = new SubagentTaskExecutor({
      bridge: {
        async run(request) {
          captured = request;
          return { output: "child output" };
        },
      },
      getContext: () => ({
        runId: "run-1",
        parentConfig: parent,
        workspaceRoot: "C:/workspace",
      }),
      fallback: fallbackExecutor(),
    });

    await executor.execute(node, "delegated");

    expect(captured?.parentConfig).toBe(parent);
    expect(captured?.parentWorkerId).toBe("review-worker");
    expect(captured?.spec.parentWorkerId).toBe("review-worker");
  });

  it("delegates non-subagent nodes to the fallback executor", async () => {
    const graph = new PlanNormalizer().normalize(basePlan(), "run-1");
    const root = graph.nodes.get(graph.rootNodeId);
    if (!root) throw new Error("missing root node");
    let bridgeCalled = false;
    const executor = new SubagentTaskExecutor({
      bridge: {
        async run() {
          bridgeCalled = true;
          return { output: "unexpected" };
        },
      },
      getContext: () => ({
        runId: "run-1",
        parentConfig: parentConfig(),
        workspaceRoot: "C:/workspace",
      }),
      fallback: fallbackExecutor(),
    });

    await expect(executor.execute(root, "foreground")).resolves.toEqual({
      output: `${root.kind}:${root.id}`,
    });
    expect(bridgeCalled).toBe(false);
  });

  it("rejects subagent nodes missing a normalized contract", async () => {
    const graph = new PlanNormalizer().normalize(basePlan(), "run-1");
    const node = graph.nodes.get("step-a");
    if (!node) throw new Error("missing node");
    const malformed = {
      ...node,
      spec: { ...node.spec },
    };
    delete malformed.spec.subagent;
    const executor = new SubagentTaskExecutor({
      bridge: {
        async run() {
          return { output: "unexpected" };
        },
      },
      getContext: () => ({
        runId: "run-1",
        parentConfig: parentConfig(),
        workspaceRoot: "C:/workspace",
      }),
      fallback: fallbackExecutor(),
    });

    await expect(executor.execute(malformed, "delegated")).rejects.toMatchObject({
      code: "SUBAGENT_SPEC",
    });
  });

  it("routes kernel-loop subagent tasks through the subagent executor bridge", async () => {
    const bridgeRequests: RuntimeSubagentBridgeRequest[] = [];
    const executor = new SubagentTaskExecutor({
      bridge: {
        async run(request) {
          bridgeRequests.push(request);
          return {
            output: "kernel child output",
            artifactRefs: ["artifact-kernel"],
          };
        },
      },
      getContext: () => ({
        runId: "run-1",
        parentWorkerId: "worker-parent",
        parentConfig: parentConfig(),
        workspaceRoot: "C:/workspace",
      }),
      fallback: fallbackExecutor(),
    });
    const loop = new KernelLoop(kernelExecutorDeps(executor));
    const events = [];

    for await (const event of loop.run("run-1", basePlan())) {
      events.push(event);
    }

    expect(bridgeRequests).toHaveLength(1);
    expect(events).toContainEqual({
      kind: "task_started",
      nodeId: "step-a",
      lane: "delegated",
      workerId: expect.any(String),
    });
    expect(bridgeRequests[0]).toMatchObject({
      runId: "run-1",
      parentTaskId: "step-a",
      lane: "delegated",
      spec: {
        taskBrief: "Inspect repo architecture",
        inputArtifactRefs: ["artifact-source"],
      },
    });
    expect(events).toContainEqual({
      kind: "task_completed",
      nodeId: "step-a",
      result: {
        output: "kernel child output",
        artifactRefs: ["artifact-kernel"],
      },
    });
    expect(events.at(-1)).toMatchObject({ kind: "run_completed", runId: "run-1" });
  });
});
