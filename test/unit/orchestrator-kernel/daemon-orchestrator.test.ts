import { describe, expect, it } from "vitest";
import type { EventWriter } from "../../../packages/event-store/src/index.js";
import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
import {
  OrchestratorKernel,
  type OrchestratorKernelOptions,
} from "../../../packages/orchestrator-kernel/src/daemon-orchestrator.js";

class MemoryEventWriter {
  readonly events: RunEvent[] = [];

  append(event: RunEvent): RunEvent {
    const stamped = {
      ...event,
      checkpointSeq: this.events.length + 1,
    };
    this.events.push(stamped);
    return stamped;
  }

  close(): void {}
}

function createKernel(options: OrchestratorKernelOptions = {}): {
  kernel: OrchestratorKernel;
  writer: MemoryEventWriter;
} {
  const writer = new MemoryEventWriter();
  return {
    kernel: new OrchestratorKernel(writer as unknown as EventWriter, options),
    writer,
  };
}

function waitForEvent(
  kernel: OrchestratorKernel,
  predicate: (event: RunEvent) => boolean,
): Promise<RunEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for event"));
    }, 2_000);
    const unsubscribe = kernel.onEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

describe("daemon orchestrator graph execution", () => {
  it("runs submitted prompts through the kernel loop instead of a one-worker stub", async () => {
    const { kernel, writer } = createKernel();
    await kernel.start();
    const completed = waitForEvent(kernel, (event) => event.kind === "run.completed");

    const runId = await kernel.submitRun("Inspect runtime wiring", "headless", {
      workspaceRoot: "C:/workspace",
    });
    await completed;

    const kinds = writer.events.map((event) => event.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "run.created",
        "run.started",
        "plan.compiled",
        "graph.normalized",
        "task.started",
        "task.completed",
        "run.completed",
      ]),
    );
    expect(kinds.at(-1)).toBe("run.completed");
    const snapshot = kernel.snapshotRunForDaemon(runId);
    expect(snapshot.run?.status).toBe("completed");
    expect(snapshot.run?.graph.totalNodes).toBeGreaterThan(1);
    expect(snapshot.run?.graph.completedNodes).toBe(snapshot.run?.graph.totalNodes);
    expect(snapshot.workers).toEqual([]);
  });

  it("routes daemon subagent nodes through the injected runtime bridge", async () => {
    const bridgeRequests: unknown[] = [];
    const { kernel, writer } = createKernel({
      planContext: {
        workspace: "C:/workspace",
        availableTools: ["repo.read"],
        availableSkills: ["research"],
        availableMcpServers: ["filesystem"],
      },
      planner: {
        async completeText() {
          return JSON.stringify({
            goal: "Inspect repo",
            steps: [
              {
                id: "inspect",
                description: "Inspect repository architecture",
                kind: "subagent",
                dependsOn: [],
                canParallelize: true,
                toolScope: ["repo.read"],
                skillScope: ["research"],
                mcpServers: ["filesystem"],
                subagent: {
                  taskBrief: "Inspect repository architecture",
                  runtimePolicy: { maxTurns: 4 },
                },
              },
            ],
            estimatedComplexity: "complex",
            requiresSubagents: true,
          });
        },
      },
      subagentBridge: {
        async run(request) {
          bridgeRequests.push(request);
          return {
            output: "child summary",
            artifactRefs: ["artifact-child"],
          };
        },
      },
    });
    await kernel.start();
    const completed = waitForEvent(kernel, (event) => event.kind === "run.completed");

    await kernel.submitRun("Inspect repo", "headless", { workspaceRoot: "C:/workspace" });
    await completed;

    expect(bridgeRequests).toHaveLength(1);
    const subagentEvents = writer.events.filter((event) => event.kind.startsWith("subagent."));
    expect(subagentEvents.map((event) => event.kind)).toEqual([
      "subagent.spawned",
      "subagent.completed",
    ]);
    expect(subagentEvents[0]?.payload).toMatchObject({
      subagentId: "inspect",
      taskPreview: "Inspect repository architecture",
      capabilities: [
        { kind: "tool", name: "repo.read" },
        { kind: "skill", name: "research" },
        { kind: "mcp", name: "filesystem" },
      ],
      runtimePolicy: { maxTurns: 4 },
    });
    expect(subagentEvents[1]?.payload).toMatchObject({
      subagentId: "inspect",
      status: "completed",
      preview: "child summary",
      artifactRefs: ["artifact-child"],
    });
  });
});
