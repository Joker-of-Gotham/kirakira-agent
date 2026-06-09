import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/event-store/src/index.js";
import {
  BudgetTracker,
  ContextAssembler,
  createEphemeralDelegateRunner,
  forkRuntimeDepsForDelegate,
  HistoryCompressor,
  ModelClient,
  SkillInjector,
  ToolExecutor,
  ToolRegistry,
  ToolSearchEngine,
} from "../../../packages/agent-runtime/src/index.js";
import { reactLoop } from "../../../packages/agent-runtime/src/loop/react-loop.js";
import type {
  AgentMcpToolGateway,
  ReactWorkerState,
  WorkingSet,
  Workspace,
} from "../../../packages/agent-runtime/src/index.js";
import type {
  DelegateRequest,
  RuntimeDeps,
} from "../../../packages/agent-runtime/src/loop/react-loop.js";

function initialState(): ReactWorkerState {
  return {
    config: {
      id: "worker-parent",
      runId: "run-1",
      workloadType: "supervisor",
      model: "test-model",
      systemPrompt: "system",
      contextBudget: {
        maxTokens: 4096,
        reservedForOutput: 512,
        toolSchemaAllocation: 512,
        skillHintAllocation: 512,
        historyAllocation: 2048,
      },
      maxTurns: 4,
    },
    turns: [],
    currentTurnSeq: 0,
    totalTokensUsed: 0,
    totalCostUsd: 0,
    status: "running",
    artifacts: [],
  };
}

function workingSet(): WorkingSet {
  return {
    systemPrompt: "system",
    messages: [],
    toolSchemas: [],
    skillHints: [],
    artifactIndex: [],
    totalTokenEstimate: 10,
  };
}

type TestContextAssembler = RuntimeDeps["contextAssembler"] & {
  assembledStates: ReactWorkerState[];
  forkedAssemblers: TestContextAssembler[];
};

function testContextAssembler(): TestContextAssembler {
  const assembledStates: ReactWorkerState[] = [];
  const forkedAssemblers: TestContextAssembler[] = [];
  const assembler = {
    setTaskPreamble() {},
    async assemble(state: ReactWorkerState) {
      assembledStates.push(state);
      return workingSet();
    },
    recordModelUsage() {},
    fork() {
      const child = testContextAssembler();
      forkedAssemblers.push(child);
      return child;
    },
    get assembledStates() {
      return assembledStates;
    },
    get forkedAssemblers() {
      return forkedAssemblers;
    },
  } as unknown as TestContextAssembler;
  return assembler;
}

function testSkillInjector(): RuntimeDeps["skillInjector"] {
  return {
    promote() {},
    getAdvertised() {
      return [];
    },
    getInjectionContent() {
      return "";
    },
    materializedPaths() {
      return "";
    },
    fork() {
      return testSkillInjector();
    },
  } as unknown as RuntimeDeps["skillInjector"];
}

function testToolExecutor(): RuntimeDeps["toolExecutor"] {
  return {
    async execute() {
      return { success: true, output: "" };
    },
    fork() {
      return testToolExecutor();
    },
  } as unknown as RuntimeDeps["toolExecutor"];
}

function runtimeDeps(
  steps: Array<Record<string, unknown>>,
  emitted: RunEvent[],
): RuntimeDeps {
  const workspace: Workspace = {
    id: "workspace-1",
    rootPath: "C:/workspace",
    sandboxProfile: "test",
    artifacts: new Map(),
  };

  return {
    modelClient: {
      async completeStructured() {
        const next = steps.shift();
        if (!next) throw new Error("no model step");
        return next;
      },
    } as unknown as RuntimeDeps["modelClient"],
    toolExecutor: testToolExecutor(),
    skillInjector: testSkillInjector(),
    contextAssembler: testContextAssembler(),
    workspaceExecutor: {} as RuntimeDeps["workspaceExecutor"],
    eventWriter: {
      async emit(event: RunEvent) {
        emitted.push(event);
      },
    },
    workspace,
    async delegateRunner(request) {
      expect(request.task).toBe("inspect subsystem");
      expect(request.parentWorkerId).toBe("worker-parent");
      expect(request.parentConfig.id).toBe("worker-parent");
      return {
        success: true,
        workerId: "worker-child",
        finalText: "child finding",
        artifactRefs: ["artifact-child"],
      };
    },
  };
}

function forkableRuntimeDeps(emitted: RunEvent[] = []): RuntimeDeps {
  const workspace: Workspace = {
    id: "workspace-1",
    rootPath: "C:/workspace",
    sandboxProfile: "test",
    artifacts: new Map(),
  };
  const gateway: AgentMcpToolGateway = {
    async callTool(request) {
      return {
        server: request.server,
        tool: request.tool,
        success: true,
        content: [{ type: "text", text: `${request.server}:${request.tool} ok` }],
        isError: false,
      };
    },
  };
  const registry = new ToolRegistry();
  registry.register({
    name: "repo.read",
    description: "repo read available delegated runtime tools",
    inputSchema: { type: "object" },
  });
  registry.register({
    name: "web.search",
    description: "web search available delegated runtime tools",
    inputSchema: { type: "object" },
  });
  registry.register({
    name: "filesystem:read_file",
    description: "filesystem read available delegated runtime tools",
    inputSchema: { type: "object" },
  });
  const budget = new BudgetTracker();
  const modelClient = new ModelClient({
    async complete() {
      return {
        text: "{}",
        model: "test-model",
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };
    },
  });
  const skillInjector = new SkillInjector([
    {
      name: "research",
      description: "research skill",
      version: "1.0.0",
      path: "unused",
    },
    {
      name: "review",
      description: "review skill",
      version: "1.0.0",
      path: "unused",
    },
  ]);
  return {
    modelClient,
    toolExecutor: new ToolExecutor(gateway, {
      pepContext: {
        sessionId: "run-1",
        traceId: "trace-1",
        userId: "user-1",
        workspaceRoot: workspace.rootPath,
        interactive: false,
        roles: [],
      },
      async onEvent(event) {
        emitted.push(event);
      },
    }),
    skillInjector,
    contextAssembler: new ContextAssembler(
      new ToolSearchEngine(),
      skillInjector,
      new HistoryCompressor(budget, modelClient),
      budget,
      registry,
      { toolCapabilityQuery: "available delegated runtime tools" },
    ),
    workspaceExecutor: {} as RuntimeDeps["workspaceExecutor"],
    eventWriter: {
      async emit(event: RunEvent) {
        emitted.push(event);
      },
    },
    workspace,
  };
}

describe("reactLoop delegate handling", () => {
  it("runs a delegate through delegateRunner and feeds the result back into parent context", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps(
      [
        { kind: "delegate", args: { task: "inspect subsystem" } },
        { kind: "final_output", output: "parent done" },
      ],
      emitted,
    );

    const yielded: RunEvent[] = [];
    for await (const event of reactLoop(initialState(), deps)) {
      yielded.push(event);
    }

    expect(yielded.map((event) => event.kind)).toContain("subagent.spawned");
    expect(yielded.map((event) => event.kind)).toContain("subagent.completed");
    expect(emitted.find((event) => event.kind === "subagent.completed")?.payload)
      .toMatchObject({
        workerId: "worker-child",
        parentWorkerId: "worker-parent",
        preview: "child finding",
        artifactRefs: ["artifact-child"],
      });

    const assembler = deps.contextAssembler as RuntimeDeps["contextAssembler"] & {
      assembledStates: ReactWorkerState[];
    };
    const secondState = assembler.assembledStates[1];
    expect(secondState?.turns[0]?.observation?.content).toBe("child finding");
    expect(secondState?.artifacts).toEqual(["artifact-child"]);
  });

  it("includes parent task and lane metadata in delegate lifecycle events", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps(
      [
        {
          kind: "delegate",
          args: {
            task: "inspect subsystem",
            parentTaskId: "task-parent",
            lane: "delegated",
            traceId: "trace-1",
            capabilities: [{ kind: "tool", name: "repo.read" }],
            permissions: ["workspace-read"],
            topology: {
              parentRole: "supervisor",
              handoffEdgeId: "handoff:supervisor:worker:tool:0",
              handoff: {
                id: "handoff:supervisor:worker:tool:0",
                from: "supervisor",
                to: "worker",
                mode: "tool",
              },
            },
            lineage: {
              rootLineageId: "run-1",
              parentLineageId: "run-1:worker:worker-parent",
              lineageId: "run-1:task:task-parent:subagent",
            },
          },
        },
        { kind: "final_output", output: "parent done" },
      ],
      emitted,
    );
    deps.delegateRunner = async (request) => {
      expect(request.parentTaskId).toBe("task-parent");
      expect(request.lane).toBe("delegated");
      expect(request.traceId).toBe("trace-1");
      expect(request.permissions).toEqual(["workspace-read"]);
      expect(request.topology).toMatchObject({
        parentRole: "supervisor",
        handoffEdgeId: "handoff:supervisor:worker:tool:0",
      });
      expect(request.lineage).toEqual({
        rootLineageId: "run-1",
        parentLineageId: "run-1:worker:worker-parent",
        lineageId: "run-1:task:task-parent:subagent",
      });
      return {
        success: true,
        workerId: "worker-child",
        finalText: "child finding",
      };
    };

    for await (const _event of reactLoop(initialState(), deps)) {
      // exhaust generator
    }

    expect(emitted.find((event) => event.kind === "subagent.spawned")?.payload)
      .toMatchObject({
        parentTaskId: "task-parent",
        parentWorkerId: "worker-parent",
        lane: "delegated",
        traceId: "trace-1",
        capabilities: [{ kind: "tool", name: "repo.read" }],
        permissions: ["workspace-read"],
        topology: {
          parentRole: "supervisor",
          handoffEdgeId: "handoff:supervisor:worker:tool:0",
        },
        lineage: {
          rootLineageId: "run-1",
          parentLineageId: "run-1:worker:worker-parent",
          lineageId: "run-1:task:task-parent:subagent",
        },
      });
    expect(emitted.find((event) => event.kind === "subagent.completed")?.payload)
      .toMatchObject({
        parentTaskId: "task-parent",
        parentWorkerId: "worker-parent",
        lane: "delegated",
        traceId: "trace-1",
        workerId: "worker-child",
        permissions: ["workspace-read"],
      });
  });

  it("emits a failed subagent completion when delegateRunner is not configured", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps(
      [
        { kind: "delegate", args: { task: "inspect subsystem" } },
        { kind: "final_output", output: "parent done" },
      ],
      emitted,
    );
    delete deps.delegateRunner;

    for await (const _event of reactLoop(initialState(), deps)) {
      // exhaust generator
    }

    expect(emitted.find((event) => event.kind === "subagent.completed")?.payload)
      .toMatchObject({
        parentWorkerId: "worker-parent",
        status: "failed",
        error: "delegate runner unavailable",
      });
  });

  it("feeds failed delegate results back into parent context", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps(
      [
        { kind: "delegate", args: { task: "inspect subsystem" } },
        { kind: "final_output", output: "parent done" },
      ],
      emitted,
    );
    deps.delegateRunner = async () => ({
      success: false,
      workerId: "worker-child",
      error: "child failure",
      artifactRefs: ["artifact-child-error"],
    });

    for await (const _event of reactLoop(initialState(), deps)) {
      // exhaust generator
    }

    const assembler = deps.contextAssembler as RuntimeDeps["contextAssembler"] & {
      assembledStates: ReactWorkerState[];
    };
    expect(assembler.assembledStates[1]?.turns[0]?.observation?.content).toBe(
      "ERROR: subagent worker-child failed: child failure",
    );
    expect(assembler.assembledStates[1]?.artifacts).toEqual([
      "artifact-child-error",
    ]);
    expect(emitted.find((event) => event.kind === "subagent.completed")?.payload)
      .toMatchObject({
        workerId: "worker-child",
        parentWorkerId: "worker-parent",
        status: "failed",
        error: "child failure",
        artifactRefs: ["artifact-child-error"],
      });
  });

  it("records thrown delegateRunner errors as failed delegate turns", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps(
      [
        { kind: "delegate", args: { task: "inspect subsystem" } },
        { kind: "final_output", output: "parent done" },
      ],
      emitted,
    );
    deps.delegateRunner = async () => {
      throw new Error("runner exploded");
    };

    for await (const _event of reactLoop(initialState(), deps)) {
      // exhaust generator
    }

    expect(emitted.find((event) => event.kind === "subagent.completed")?.payload)
      .toMatchObject({
        parentWorkerId: "worker-parent",
        status: "failed",
        error: "runner exploded",
      });
  });

  it("provides an EphemeralWorker-backed DelegateRunner adapter", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps([{ kind: "final_output", output: "child result" }], emitted);
    delete deps.delegateRunner;

    const runner = createEphemeralDelegateRunner(deps, {
      policy: { maxTurns: 2, systemPreamble: "child policy" },
    });
    const result = await runner({
      subagentId: "sg-1",
      parentWorkerId: "worker-parent",
      parentConfig: initialState().config,
      runId: "run-1",
      task: "child task",
      action: { kind: "delegate", args: { task: "child task" } },
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.finalText).toBe("child result");
    expect(result.workerId).toBeTruthy();
    expect(emitted.map((event) => event.kind)).toContain("run.completed");
  });

  it("hydrates legacy delegate action metadata for EphemeralWorker-backed delegates", async () => {
    const parentDeps = runtimeDeps([], []);
    delete parentDeps.delegateRunner;
    const childEmitted: RunEvent[] = [];
    const childDeps = runtimeDeps([{ kind: "final_output", output: "child result" }], childEmitted);
    delete childDeps.delegateRunner;
    let forkedRequest: DelegateRequest | undefined;

    const runner = createEphemeralDelegateRunner(parentDeps, {
      forkDeps(_deps, _scope, request) {
        forkedRequest = request;
        return childDeps;
      },
    });
    const result = await runner({
      subagentId: "sg-1",
      parentWorkerId: "worker-parent",
      parentConfig: initialState().config,
      runId: "run-1",
      task: "child task",
      action: {
        kind: "delegate",
        args: {
          task: "child task",
          permissions: ["workspace-read"],
          topology: {
            parentRole: "supervisor",
            handoffEdgeId: "handoff:supervisor:worker:tool:0",
          },
          lineage: {
            rootLineageId: "run-1",
            parentLineageId: "run-1:worker:worker-parent",
            lineageId: "run-1:task:child:subagent",
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(forkedRequest).toMatchObject({
      permissions: ["workspace-read"],
      topology: {
        parentRole: "supervisor",
        handoffEdgeId: "handoff:supervisor:worker:tool:0",
      },
      lineage: {
        rootLineageId: "run-1",
        parentLineageId: "run-1:worker:worker-parent",
        lineageId: "run-1:task:child:subagent",
      },
    });
    const assembler = childDeps.contextAssembler as RuntimeDeps["contextAssembler"] & {
      assembledStates: ReactWorkerState[];
    };
    expect(assembler.assembledStates[0]?.config).toMatchObject({
      permissions: ["workspace-read"],
      topology: {
        parentRole: "supervisor",
        handoffEdgeId: "handoff:supervisor:worker:tool:0",
      },
      lineage: {
        rootLineageId: "run-1",
        parentLineageId: "run-1:worker:worker-parent",
        lineageId: "run-1:task:child:subagent",
      },
    });
  });

  it("prefers top-level delegate metadata over legacy action args for child config", async () => {
    const parentDeps = runtimeDeps([], []);
    delete parentDeps.delegateRunner;
    const childEmitted: RunEvent[] = [];
    const childDeps = runtimeDeps([{ kind: "final_output", output: "child result" }], childEmitted);
    delete childDeps.delegateRunner;
    let forkedRequest: DelegateRequest | undefined;

    const runner = createEphemeralDelegateRunner(parentDeps, {
      forkDeps(_deps, _scope, request) {
        forkedRequest = request;
        return childDeps;
      },
    });
    const result = await runner({
      subagentId: "sg-1",
      parentWorkerId: "worker-parent",
      parentConfig: initialState().config,
      runId: "run-1",
      task: "child task",
      permissions: ["top-level"],
      topology: {
        parentRole: "top-parent",
        handoffEdgeId: "handoff:top",
      },
      lineage: {
        rootLineageId: "run-top",
        parentLineageId: "run-top:worker:parent",
        lineageId: "run-top:task:child:subagent",
      },
      action: {
        kind: "delegate",
        args: {
          task: "child task",
          permissions: ["legacy"],
          topology: {
            parentRole: "legacy-parent",
            handoffEdgeId: "handoff:legacy",
          },
          lineage: {
            rootLineageId: "run-legacy",
            parentLineageId: "run-legacy:worker:parent",
            lineageId: "run-legacy:task:child:subagent",
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(forkedRequest).toMatchObject({
      permissions: ["top-level"],
      topology: {
        parentRole: "top-parent",
        handoffEdgeId: "handoff:top",
      },
      lineage: {
        rootLineageId: "run-top",
        parentLineageId: "run-top:worker:parent",
        lineageId: "run-top:task:child:subagent",
      },
    });
    const assembler = childDeps.contextAssembler as RuntimeDeps["contextAssembler"] & {
      assembledStates: ReactWorkerState[];
    };
    expect(assembler.assembledStates[0]?.config).toMatchObject({
      permissions: ["top-level"],
      topology: {
        parentRole: "top-parent",
        handoffEdgeId: "handoff:top",
      },
      lineage: {
        rootLineageId: "run-top",
        parentLineageId: "run-top:worker:parent",
        lineageId: "run-top:task:child:subagent",
      },
    });
  });

  it("scopes EphemeralWorker-backed delegates from requested capabilities", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps([{ kind: "final_output", output: "child result" }], emitted);
    delete deps.delegateRunner;

    const runner = createEphemeralDelegateRunner(deps);
    const result = await runner({
      subagentId: "sg-1",
      parentWorkerId: "worker-parent",
      parentConfig: initialState().config,
      runId: "run-1",
      task: "child task",
      capabilities: [
        { kind: "tool", name: "repo.read" },
        { kind: "mcp", name: "filesystem" },
      ],
      modelPreference: "scoped-model",
      action: { kind: "delegate", args: { task: "child task" } },
    });

    expect(result.success).toBe(true);
    const assembler = deps.contextAssembler as TestContextAssembler;
    expect(assembler.assembledStates).toEqual([]);
    const childAssembler = assembler.forkedAssemblers[0];
    expect(childAssembler?.assembledStates[0]?.config).toMatchObject({
      model: "scoped-model",
      toolScope: ["repo.read"],
      skillScope: [],
      mcpServers: ["filesystem"],
    });
  });

  it("uses forked runtime deps for scoped delegates when provided", async () => {
    const parentDeps = runtimeDeps([], []);
    delete parentDeps.delegateRunner;
    const childEmitted: RunEvent[] = [];
    const childDeps = runtimeDeps([{ kind: "final_output", output: "forked child" }], childEmitted);
    delete childDeps.delegateRunner;
    let forkedScope: unknown;

    const runner = createEphemeralDelegateRunner(parentDeps, {
      forkDeps(_deps, scope) {
        forkedScope = scope;
        return childDeps;
      },
    });
    const result = await runner({
      subagentId: "sg-1",
      parentWorkerId: "worker-parent",
      parentConfig: initialState().config,
      runId: "run-1",
      task: "child task",
      capabilities: [{ kind: "skill", name: "research" }],
      action: { kind: "delegate", args: { task: "child task" } },
    });

    expect(result).toMatchObject({ success: true, finalText: "forked child" });
    expect(forkedScope).toEqual({
      toolNames: [],
      skillNames: ["research"],
      mcpServers: [],
    });
    expect(childEmitted.map((event) => event.kind)).toContain("run.completed");
  });

  it("creates a concrete scoped child runtime view by default", async () => {
    const emitted: RunEvent[] = [];
    const parentDeps = forkableRuntimeDeps(emitted);
    const childDeps = forkRuntimeDepsForDelegate(parentDeps, {
      capabilityScope: {
        toolNames: ["repo.read"],
        skillNames: ["research"],
        mcpServers: ["filesystem"],
      },
    });

    expect(childDeps.contextAssembler).not.toBe(parentDeps.contextAssembler);
    expect(childDeps.skillInjector).not.toBe(parentDeps.skillInjector);
    expect(childDeps.toolExecutor).not.toBe(parentDeps.toolExecutor);
    expect(childDeps.delegateRunner).toBeUndefined();

    const state = initialState();
    state.config = {
      ...state.config,
      toolScope: ["repo.read"],
      skillScope: ["research"],
      mcpServers: ["filesystem"],
    };
    const workingSet = await childDeps.contextAssembler.assemble(state);

    expect(workingSet.toolSchemas.map((tool) => tool.name).sort()).toEqual([
      "filesystem:read_file",
      "repo.read",
    ]);
    expect(workingSet.skillHints.map((skill) => skill.name)).toEqual(["research"]);
    expect(workingSet.systemPrompt).toContain("research skill");
    expect(workingSet.systemPrompt).not.toContain("review skill");
    expect(workingSet.systemPrompt).not.toContain("web search available delegated runtime tools");

    const denied = await childDeps.toolExecutor.execute("web.search", { q: "x" });
    expect(denied).toMatchObject({
      success: false,
      error: "capability_scope_denied",
    });

    const allowed = await childDeps.toolExecutor.execute("filesystem:read_file", {
      path: "README.md",
    });
    expect(allowed).toMatchObject({
      success: true,
      output: "filesystem:read_file ok",
    });
    expect(emitted.map((event) => event.kind)).toContain("tool.call.started");
  });

  it("denies tool calls outside the worker capability scope", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps(
      [
        { kind: "tool_call", toolName: "web.search", args: { q: "x" } },
        { kind: "final_output", output: "parent done" },
      ],
      emitted,
    );
    let executed = false;
    deps.toolExecutor = {
      async execute() {
        executed = true;
        return { success: true, output: "should not run" };
      },
    } as RuntimeDeps["toolExecutor"];
    const state = initialState();
    state.config.toolScope = [];

    for await (const _event of reactLoop(state, deps)) {
      // exhaust generator
    }

    expect(executed).toBe(false);
    const assembler = deps.contextAssembler as RuntimeDeps["contextAssembler"] & {
      assembledStates: ReactWorkerState[];
    };
    expect(assembler.assembledStates[1]?.turns[0]?.observation?.content).toBe(
      "ERROR: tool_call denied by capability scope: web.search",
    );
    expect(emitted.find((event) => event.kind === "tool.call.failed")?.payload)
      .toMatchObject({
        toolName: "web.search",
        reason: "capability_scope_denied",
      });
  });

  it("denies skill execution outside the worker capability scope", async () => {
    const emitted: RunEvent[] = [];
    const deps = runtimeDeps(
      [
        { kind: "skill_exec", skillName: "review" },
        { kind: "final_output", output: "parent done" },
      ],
      emitted,
    );
    let promoted = false;
    deps.skillInjector = {
      promote() {
        promoted = true;
      },
      getInjectionContent() {
        return "should not load";
      },
    } as RuntimeDeps["skillInjector"];
    const state = initialState();
    state.config.skillScope = [];

    for await (const _event of reactLoop(state, deps)) {
      // exhaust generator
    }

    expect(promoted).toBe(false);
    const assembler = deps.contextAssembler as RuntimeDeps["contextAssembler"] & {
      assembledStates: ReactWorkerState[];
    };
    expect(assembler.assembledStates[1]?.turns[0]?.observation?.content).toBe(
      "ERROR: skill_exec denied by capability scope: review",
    );
  });
});
