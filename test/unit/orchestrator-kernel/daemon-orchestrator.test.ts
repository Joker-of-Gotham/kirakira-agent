import { describe, expect, it } from "vitest";
import type {
  CheckpointEnvelope,
  EventWriter,
} from "../../../packages/event-store/src/index.js";
import type { ResearchSourceAdapter } from "../../../packages/deep-research/src/index.js";
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

class MemoryCheckpointRepository {
  readonly envelopes = new Map<string, CheckpointEnvelope>();

  async save(envelope: CheckpointEnvelope): Promise<void> {
    this.envelopes.set(envelope.id, envelope);
  }

  async load(id: string): Promise<CheckpointEnvelope | undefined> {
    return this.envelopes.get(id);
  }

  async delete(id: string): Promise<void> {
    this.envelopes.delete(id);
  }
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

function daemonMemoryResearchAdapter(): ResearchSourceAdapter {
  return {
    kind: "memory",
    async search(request) {
      return [
        {
          id: "daemon-evidence-1",
          sourceKind: "memory",
          query: request.query,
          content: "DAEMON RAW EVIDENCE MUST NOT LEAK",
          summary: "Daemon research tasks run through the kernel executor chain.",
          citations: [
            {
              id: "daemon-citation-1",
              sourceKind: "memory",
              title: "Daemon research note",
              uri: "memory://daemon-research",
              summary: "The daemon injected adapter emitted cited research evidence.",
              rawSpan: "DAEMON RAW SPAN MUST NOT LEAK",
            },
          ],
        },
      ];
    },
  };
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
        orchestration: {
          handoff_mode: "swarm",
          default_role: "supervisor",
          roles: [
            {
              id: "delegate",
              lane: "delegated",
              model: "openai:gpt-5.4-delegate",
              max_turns: 6,
              context: "isolated",
              permissions: ["workspace-read"],
            },
          ],
          handoffs: [
            {
              from: "supervisor",
              to: "delegate",
              mode: "tool",
              input_filter: "scoped-task-brief",
            },
          ],
        },
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
                  role: "delegate",
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
    const runId = subagentEvents[0]?.runId;
    if (typeof runId !== "string") throw new Error("missing run id");
    expect(subagentEvents.map((event) => event.kind)).toEqual([
      "subagent.spawned",
      "subagent.completed",
    ]);
    expect(subagentEvents[0]?.payload).toMatchObject({
      subagentId: "inspect",
      taskPreview: "Inspect repository architecture",
      role: "delegate",
      requestedLane: "delegated",
      permissions: ["workspace-read"],
      parentRole: "supervisor",
      handoffEdgeId: "handoff:supervisor:delegate:tool:0",
      handoff: {
        id: "handoff:supervisor:delegate:tool:0",
        from: "supervisor",
        to: "delegate",
        mode: "tool",
        inputFilter: "scoped-task-brief",
      },
      rootLineageId: runId,
      parentLineageId: `${runId}:worker:${runId}-supervisor`,
      lineageId: `${runId}:task:inspect:subagent`,
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
      handoffEdgeId: "handoff:supervisor:delegate:tool:0",
      rootLineageId: runId,
      parentLineageId: `${runId}:worker:${runId}-supervisor`,
      lineageId: `${runId}:task:inspect:subagent`,
      preview: "child summary",
      artifactRefs: ["artifact-child"],
    });
  });

  it("runs daemon research nodes through injected deep research adapters", async () => {
    const { kernel, writer } = createKernel({
      planner: {
        async completeText() {
          return JSON.stringify({
            goal: "Collect research evidence",
            steps: [
              {
                id: "research-a",
                description: "Collect runtime evidence",
                kind: "research",
                dependsOn: [],
                canParallelize: false,
                research: {
                  question: "Which runtime evidence is available?",
                  requiredSourceKinds: ["memory"],
                },
              },
            ],
            estimatedComplexity: "moderate",
            requiresSubagents: false,
          });
        },
      },
      deepResearch: {
        config: {
          enabled: true,
          source_policy: "workspace",
          max_depth: 1,
          max_breadth: 1,
          max_tool_calls: 2,
        },
        sourceAdapters: [daemonMemoryResearchAdapter()],
      },
    });
    await kernel.start();
    const completed = waitForEvent(kernel, (event) => event.kind === "run.completed");

    await kernel.submitRun("Collect research evidence", "headless", {
      workspaceRoot: "C:/workspace",
    });
    await completed;

    const kinds = writer.events.map((event) => event.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "research.started",
        "research.plan.created",
        "research.citation.added",
        "research.completed",
        "task.completed",
        "run.completed",
      ]),
    );
    const taskStarted = writer.events.find(
      (event) => event.kind === "task.started" && event.payload.taskId === "research-a",
    );
    expect(taskStarted?.payload).toMatchObject({
      taskId: "research-a",
      kind: "research",
      lane: "background",
    });
    const taskCompleted = writer.events.find(
      (event) => event.kind === "task.completed" && event.payload.taskId === "research-a",
    );
    expect(taskCompleted?.payload.result).toMatchObject({
      output: {
        status: "evidence_collected",
        evidenceCount: 1,
        citationCount: 1,
        toolCalls: 1,
      },
    });
    expect(JSON.stringify(taskCompleted?.payload.result)).not.toContain(
      "DAEMON RAW EVIDENCE MUST NOT LEAK",
    );
    expect(JSON.stringify(taskCompleted?.payload.result)).not.toContain(
      "DAEMON RAW SPAN MUST NOT LEAK",
    );
  });

  it("restores graph state from durable async checkpoints", async () => {
    const checkpointRepository = new MemoryCheckpointRepository();
    const { kernel, writer } = createKernel({
      checkpointRepository,
      checkpointDurability: "async",
      planner: {
        async completeText() {
          return JSON.stringify({
            goal: "Inspect runtime in parallel",
            steps: [
              {
                id: "inspect-contracts",
                description: "Inspect contracts",
                kind: "synthesize",
                dependsOn: [],
                canParallelize: true,
              },
              {
                id: "inspect-runtime",
                description: "Inspect runtime",
                kind: "synthesize",
                dependsOn: [],
                canParallelize: true,
              },
            ],
            estimatedComplexity: "moderate",
            requiresSubagents: false,
          });
        },
      },
    });
    await kernel.start();
    const checkpointSaved = waitForEvent(kernel, (event) => event.kind === "checkpoint.saved");
    const completed = waitForEvent(kernel, (event) => event.kind === "run.completed");

    const runId = await kernel.submitRun("Inspect runtime in parallel", "headless", {
      workspaceRoot: "C:/workspace",
    });
    const checkpointEvent = await checkpointSaved;
    await completed;
    const checkpointId = checkpointEvent.payload.checkpointId;
    expect(typeof checkpointId).toBe("string");
    expect(checkpointRepository.envelopes.has(checkpointId as string)).toBe(true);

    const restored = waitForEvent(kernel, (event) => event.kind === "checkpoint.restored");
    kernel.forwardControl({
      type: "resume",
      runId,
      fromCheckpoint: checkpointId as string,
    });
    const restoredEvent = await restored;

    expect(restoredEvent.payload).toMatchObject({
      checkpointId,
      totalNodes: expect.any(Number),
      completedNodes: expect.any(Number),
    });
    const kinds = writer.events.map((event) => event.kind);
    expect(kinds).toEqual(expect.arrayContaining(["checkpoint.restored", "interrupt.resumed"]));
    const snapshot = kernel.snapshotRunForDaemon(runId);
    expect(snapshot.run?.status).toBe("running");
    expect(snapshot.run?.checkpointId).toBe(checkpointId);
    expect(snapshot.run?.graph.totalNodes).toBeGreaterThan(0);
  });
});
