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

const topologyContext: PlanContext = {
  ...context,
  orchestration: {
    handoff_mode: "swarm",
    default_role: "supervisor",
    roles: [
      {
        id: "researcher",
        lane: "background",
        model: "openai:gpt-5.4-research",
        max_turns: 5,
        system_preamble: "Collect concise source-backed evidence.",
        context: "filtered",
        tool_scope: ["web.search"],
        permissions: ["workspace-read"],
      },
      {
        id: "implementer",
        lane: "delegated",
        model: "openai:gpt-5.4-code",
        max_turns: 6,
        context: "isolated",
        tool_scope: ["repo.read"],
        skill_scope: ["review"],
        mcp_servers: ["filesystem"],
        permissions: ["workspace-write-gated"],
      },
    ],
    handoffs: [
      {
        from: "supervisor",
        to: "researcher",
        mode: "swarm",
        input_filter: "research-brief",
      },
      {
        from: "supervisor",
        to: "implementer",
        mode: "tool",
        input_filter: "implementation-brief",
        approval_required: true,
        conditions: ["workspace-write"],
      },
    ],
  },
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

  it("normalizes topology role metadata and role-derived lane without granting capabilities", () => {
    const graph = new PlanNormalizer().normalize(
      basePlan({
        context: topologyContext,
        steps: [
          {
            id: "step-a",
            kind: "subagent",
            description: "Collect evidence",
            dependsOn: [],
            canParallelize: true,
            toolScope: ["repo.read"],
            subagent: {
              taskBrief: "Research local evidence",
              role: "researcher",
            },
          },
        ],
      }),
      "run-1",
    );

    expect(graph.nodes.get("step-a")?.spec.subagent).toMatchObject({
      role: "researcher",
      lane: "background",
      capabilities: [{ kind: "tool", name: "repo.read" }],
      modelPreference: "openai:gpt-5.4-research",
      runtimePolicy: {
        maxTurns: 5,
        systemPreamble: "Collect concise source-backed evidence.",
        contextMode: "filtered",
      },
      permissions: ["workspace-read"],
      topology: {
        parentRole: "supervisor",
        handoffEdgeId: "handoff:supervisor:researcher:swarm:0",
        handoff: {
          id: "handoff:supervisor:researcher:swarm:0",
          from: "supervisor",
          to: "researcher",
          mode: "swarm",
          inputFilter: "research-brief",
        },
      },
    });
  });

  it("uses topology role capability and permission defaults when task scopes are omitted", () => {
    const graph = new PlanNormalizer().normalize(
      basePlan({
        context: topologyContext,
        steps: [
          {
            id: "step-a",
            kind: "subagent",
            description: "Implement a bounded change",
            dependsOn: [],
            canParallelize: true,
            subagent: {
              taskBrief: "Implement a bounded change",
              role: "implementer",
            },
          },
        ],
      }),
      "run-1",
    );

    expect(graph.nodes.get("step-a")?.spec).toMatchObject({
      approvalRequired: true,
      subagent: {
        role: "implementer",
        lane: "delegated",
        modelPreference: "openai:gpt-5.4-code",
        capabilities: [
          { kind: "tool", name: "repo.read" },
          { kind: "skill", name: "review" },
          { kind: "mcp", name: "filesystem" },
        ],
        runtimePolicy: { maxTurns: 6, contextMode: "isolated" },
        permissions: ["workspace-write-gated"],
        topology: {
          parentRole: "supervisor",
          handoffEdgeId: "handoff:supervisor:implementer:tool:1",
          handoff: {
            id: "handoff:supervisor:implementer:tool:1",
            from: "supervisor",
            to: "implementer",
            mode: "tool",
            inputFilter: "implementation-brief",
            approvalRequired: true,
            conditions: ["workspace-write"],
          },
        },
      },
    });
    expect(graph.edges).toContainEqual({
      from: "step-a",
      to: "step-a",
      kind: "blocks_on_approval",
      metadata: { self: true },
    });
  });

  it("rejects unknown topology roles when a role catalog is available", () => {
    expect(() =>
      new PlanNormalizer().normalize(
        basePlan({
          context: topologyContext,
          steps: [
            {
              id: "step-a",
              kind: "subagent",
              description: "Escalate",
              dependsOn: [],
              canParallelize: true,
              subagent: {
                role: "admin",
              },
            },
          ],
        }),
        "run-1",
      ),
    ).toThrow(/Unknown subagent topology role/);
  });

  it("rejects planner lane hints that do not resolve through topology roles", () => {
    expect(() =>
      new PlanNormalizer().normalize(
        basePlan({
          context: topologyContext,
          steps: [
            {
              id: "step-a",
              kind: "subagent",
              description: "Jump queue",
              dependsOn: [],
              canParallelize: true,
              subagent: {
                taskBrief: "Jump queue",
                lane: "foreground",
              },
            },
          ],
        }),
        "run-1",
      ),
    ).toThrow(/lane must resolve through a known topology role/);
  });

  it("rejects planner lane hints that conflict with the selected topology role", () => {
    expect(() =>
      new PlanNormalizer().normalize(
        basePlan({
          context: topologyContext,
          steps: [
            {
              id: "step-a",
              kind: "subagent",
              description: "Misroute researcher",
              dependsOn: [],
              canParallelize: true,
              subagent: {
                taskBrief: "Misroute researcher",
                role: "researcher",
                lane: "foreground",
              },
            },
          ],
        }),
        "run-1",
      ),
    ).toThrow(/conflicts with topology role/);
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
                role: "researcher",
                lane: "background",
                capabilities: [{ kind: "tool", name: "web.search" }],
                modelPreference: "openai:gpt-5.4",
                permissions: ["network-docs-only"],
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
        role: "researcher",
        lane: "background",
        capabilities: [{ kind: "tool", name: "web.search" }],
        modelPreference: "openai:gpt-5.4",
        permissions: ["network-docs-only"],
        outputSchema: {
          type: "object",
          properties: { sources: { type: "array" } },
        },
      },
    });
  });

  it("hydrates planner research fields into normalized task specs", async () => {
    const compiler = new GoalCompiler({
      async completeText() {
        return JSON.stringify({
          goal: "research",
          steps: [
            {
              id: "research-a",
              description: "Collect evidence",
              kind: "research",
              dependsOn: [],
              canParallelize: false,
              research: {
                question: "What evidence should be cited?",
                subquestions: ["Which runtime path emits events?"],
                constraints: ["Use only workspace evidence"],
                audience: "maintainers",
                requiredSourceKinds: ["memory", "file", "unknown"],
                config: {
                  enabled: true,
                  source_policy: "workspace",
                  max_depth: 2,
                  max_breadth: 3,
                  max_tool_calls: 4,
                  require_citations: true,
                },
                metadata: {
                  reason: "regression",
                  nested: { keptForExecutor: true },
                },
              },
            },
          ],
          estimatedComplexity: "complex",
          requiresSubagents: false,
        });
      },
    });

    const plan = await compiler.compile("research", context);
    const graph = new PlanNormalizer().normalize(plan, "run-1");

    expect(plan.steps[0]).toMatchObject({
      kind: "research",
      research: {
        question: "What evidence should be cited?",
        subquestions: ["Which runtime path emits events?"],
        constraints: ["Use only workspace evidence"],
        audience: "maintainers",
        requiredSourceKinds: ["memory", "file"],
        config: {
          enabled: true,
          source_policy: "workspace",
          max_depth: 2,
          max_breadth: 3,
          max_tool_calls: 4,
          require_citations: true,
        },
      },
    });
    expect(graph.nodes.get("research-a")?.spec.research).toMatchObject({
      question: "What evidence should be cited?",
      requiredSourceKinds: ["memory", "file"],
      config: {
        enabled: true,
        source_policy: "workspace",
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
      lineage: {
        rootLineageId: "run-1",
        parentLineageId: "run-1:worker:worker-parent",
        lineageId: "run-1:task:step-a:subagent",
      },
    });
  });

  it("maps kernel subagent specs into the runtime delegate runner", async () => {
    const spec: SubagentSpec = {
      taskBrief: "Inspect repo architecture",
      capabilities: [{ kind: "tool", name: "repo.read" }],
      role: "implementer",
      lane: "delegated",
      modelPreference: "openai:gpt-5.4",
      runtimePolicy: { maxTurns: 4 },
      parentWorkerId: "worker-parent",
      parentTaskId: "step-a",
      runId: "run-1",
      traceId: "trace-1",
      workspaceRoot: "C:/workspace",
      policyCeiling: { network: "restricted" },
      permissions: ["workspace-write-gated"],
      topology: {
        parentRole: "supervisor",
        handoffEdgeId: "handoff:supervisor:implementer:tool:0",
        handoff: {
          id: "handoff:supervisor:implementer:tool:0",
          from: "supervisor",
          to: "implementer",
          mode: "tool",
        },
      },
      lineage: {
        rootLineageId: "run-1",
        parentLineageId: "run-1:worker:worker-parent",
        lineageId: "run-1:task:step-a:subagent",
      },
      inputArtifactRefs: ["artifact-source"],
      outputSchema: { type: "object" },
    };
    const bridge = new DelegateRunnerSubagentBridge(async (request) => {
      expect(request).toMatchObject({
        parentTaskId: "step-a",
        parentWorkerId: "worker-parent",
        role: "implementer",
        lane: "delegated",
        requestedLane: "delegated",
        traceId: "trace-1",
        task: "Inspect repo architecture",
        capabilities: [{ kind: "tool", name: "repo.read" }],
        modelPreference: "openai:gpt-5.4",
        runtimePolicy: { maxTurns: 4 },
        policyCeiling: { network: "restricted" },
        inputArtifactRefs: ["artifact-source"],
        outputSchema: { type: "object" },
        permissions: ["workspace-write-gated"],
        topology: {
          parentRole: "supervisor",
          handoffEdgeId: "handoff:supervisor:implementer:tool:0",
        },
        lineage: {
          rootLineageId: "run-1",
          parentLineageId: "run-1:worker:worker-parent",
          lineageId: "run-1:task:step-a:subagent",
        },
        action: {
          args: {
            permissions: ["workspace-write-gated"],
            handoffEdgeId: "handoff:supervisor:implementer:tool:0",
            topology: {
              parentRole: "supervisor",
              handoffEdgeId: "handoff:supervisor:implementer:tool:0",
            },
            lineage: {
              rootLineageId: "run-1",
              parentLineageId: "run-1:worker:worker-parent",
              lineageId: "run-1:task:step-a:subagent",
            },
          },
        },
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
