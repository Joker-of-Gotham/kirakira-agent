import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/event-store/src/index.js";
import { createEphemeralDelegateRunner } from "../../../packages/agent-runtime/src/index.js";
import { reactLoop } from "../../../packages/agent-runtime/src/loop/react-loop.js";
import type {
  ReactWorkerState,
  WorkingSet,
  Workspace,
} from "../../../packages/agent-runtime/src/index.js";
import type { RuntimeDeps } from "../../../packages/agent-runtime/src/loop/react-loop.js";

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
  const assembledStates: ReactWorkerState[] = [];

  return {
    modelClient: {
      async completeStructured() {
        const next = steps.shift();
        if (!next) throw new Error("no model step");
        return next;
      },
    } as unknown as RuntimeDeps["modelClient"],
    toolExecutor: {} as RuntimeDeps["toolExecutor"],
    skillInjector: {
      promote() {},
      getInjectionContent() {
        return "";
      },
    } as unknown as RuntimeDeps["skillInjector"],
    contextAssembler: {
      setTaskPreamble() {},
      async assemble(state: ReactWorkerState) {
        assembledStates.push(state);
        return workingSet();
      },
      recordModelUsage() {},
      get assembledStates() {
        return assembledStates;
      },
    } as unknown as RuntimeDeps["contextAssembler"] & {
      assembledStates: ReactWorkerState[];
    },
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
});
