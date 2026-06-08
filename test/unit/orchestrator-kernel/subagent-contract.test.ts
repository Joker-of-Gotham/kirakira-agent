import { describe, expect, it } from "vitest";
import type { ReactWorkerConfig } from "../../../packages/agent-runtime/src/index.js";
import { PlanNormalizer } from "../../../packages/orchestrator-kernel/src/compiler/plan-normalizer.js";
import { GoalCompiler } from "../../../packages/orchestrator-kernel/src/compiler/goal-compiler.js";
import {
  assertWithinParentPolicy,
  DelegateRunnerSubagentBridge,
  subagentSpecFromTaskNode,
} from "../../../packages/orchestrator-kernel/src/index.js";
import type {
  PlanContext,
  RunPlan,
  SubagentSpec,
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

function parentConfig(): ReactWorkerConfig {
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
  };
}

describe("orchestrator subagent contract", () => {
  it("normalizes subagent plan scopes into a typed task contract", () => {
    const graph = new PlanNormalizer().normalize(basePlan(), "run-1");
    const node = graph.nodes.get("step-a");

    expect(node?.spec.subagent).toMatchObject({
      taskBrief: "Inspect repo architecture",
      capabilities: [
        { kind: "tool", name: "repo.read" },
        { kind: "skill", name: "research" },
        { kind: "mcp", name: "filesystem" },
      ],
      modelPreference: "openai:gpt-5.4",
      runtimePolicy: { maxTurns: 8, contextMode: "filtered" },
      inputArtifactRefs: ["artifact-source"],
      outputSchema: {
        type: "object",
        properties: { summary: { type: "string" } },
      },
      policyCeiling: {
        network: "restricted",
        filesystemWrite: "ask",
        shell: "deny",
      },
    });
  });

  it("keeps unscoped subagents isolated instead of inheriting every available capability", () => {
    const plan = basePlan({
      steps: [
        {
          id: "step-a",
          kind: "subagent",
          description: "Isolated analysis",
          dependsOn: [],
          canParallelize: true,
        },
      ],
    });

    const graph = new PlanNormalizer().normalize(plan, "run-1");

    expect(graph.nodes.get("step-a")?.spec.subagent?.capabilities).toEqual([]);
  });

  it("rejects unknown subagent capabilities during normalization", () => {
    const plan = basePlan({
      steps: [
        {
          id: "step-a",
          kind: "subagent",
          description: "Unsafe analysis",
          dependsOn: [],
          canParallelize: true,
          subagent: {
            capabilities: [{ kind: "tool", name: "unknown.tool" }],
          },
        },
      ],
    });

    expect(() => new PlanNormalizer().normalize(plan, "run-1")).toThrow(
      /Unknown tool capability/,
    );
  });

  it("hydrates planner subagent fields instead of dropping them", async () => {
    const compiler = new GoalCompiler({
      async completeText() {
        return JSON.stringify({
          goal: "research",
          steps: [
            {
              id: "step-a",
              description: "Research topic",
              kind: "subagent",
              dependsOn: [],
              canParallelize: true,
              toolScope: ["web.search"],
              skillScope: ["research"],
              mcpServers: ["filesystem"],
              inputArtifactRefs: ["artifact-source"],
              subagent: {
                taskBrief: "Research with citations",
                capabilities: [{ kind: "tool", name: "web.search" }],
                modelPreference: "openai:gpt-5.4",
                outputSchema: {
                  type: "object",
                  properties: { sources: { type: "array" } },
                },
              },
            },
          ],
          estimatedComplexity: "complex",
          requiresSubagents: true,
        });
      },
    });

    const plan = await compiler.compile("research", context);

    expect(plan.steps[0]).toMatchObject({
      toolScope: ["web.search"],
      skillScope: ["research"],
      mcpServers: ["filesystem"],
      inputArtifactRefs: ["artifact-source"],
      subagent: {
        taskBrief: "Research with citations",
        capabilities: [{ kind: "tool", name: "web.search" }],
        modelPreference: "openai:gpt-5.4",
        outputSchema: {
          type: "object",
          properties: { sources: { type: "array" } },
        },
      },
    });
  });

  it("creates a launch spec from a normalized subagent task node", () => {
    const graph = new PlanNormalizer().normalize(basePlan(), "run-1");
    const node = graph.nodes.get("step-a");
    if (!node) throw new Error("missing node");

    const spec = subagentSpecFromTaskNode(node, {
      runId: "run-1",
      parentWorkerId: "worker-parent",
      workspaceRoot: "C:/workspace",
      traceId: "trace-1",
    });

    expect(spec).toMatchObject({
      taskBrief: "Inspect repo architecture",
      parentTaskId: "step-a",
      parentWorkerId: "worker-parent",
      runId: "run-1",
      workspaceRoot: "C:/workspace",
      traceId: "trace-1",
    });
  });

  it("maps kernel subagent specs into the runtime delegate runner", async () => {
    const spec: SubagentSpec = {
      taskBrief: "Inspect repo architecture",
      capabilities: [{ kind: "tool", name: "repo.read" }],
      modelPreference: "openai:gpt-5.4",
      runtimePolicy: { maxTurns: 4 },
      parentWorkerId: "worker-parent",
      parentTaskId: "step-a",
      runId: "run-1",
      traceId: "trace-1",
      workspaceRoot: "C:/workspace",
      policyCeiling: { network: "restricted" },
      inputArtifactRefs: ["artifact-source"],
      outputSchema: { type: "object" },
    };
    const bridge = new DelegateRunnerSubagentBridge(async (request) => {
      expect(request).toMatchObject({
        parentTaskId: "step-a",
        parentWorkerId: "worker-parent",
        lane: "delegated",
        traceId: "trace-1",
        task: "Inspect repo architecture",
        capabilities: [{ kind: "tool", name: "repo.read" }],
        modelPreference: "openai:gpt-5.4",
        runtimePolicy: { maxTurns: 4 },
        policyCeiling: { network: "restricted" },
        inputArtifactRefs: ["artifact-source"],
        outputSchema: { type: "object" },
      });
      return {
        success: true,
        workerId: "worker-child",
        finalText: "child output",
        artifactRefs: ["artifact-a"],
      };
    });

    const result = await bridge.run({
      runId: "run-1",
      parentTaskId: "step-a",
      parentWorkerId: "worker-parent",
      parentConfig: parentConfig(),
      workspaceRoot: "C:/workspace",
      spec,
      lane: "delegated",
    });

    expect(result).toEqual({
      output: "child output",
      artifactRefs: ["artifact-a"],
    });
  });

  it("rejects network, filesystem, and shell policy escalation", () => {
    expect(() =>
      assertWithinParentPolicy({ network: "full" }, { network: "restricted" }),
    ).toThrow(/network/);
    expect(() =>
      assertWithinParentPolicy(
        { filesystemWrite: "allow" },
        { filesystemWrite: "ask" },
      ),
    ).toThrow(/filesystem/);
    expect(() =>
      assertWithinParentPolicy({ shell: "allow" }, { shell: "deny" }),
    ).toThrow(/shell/);
  });
});
