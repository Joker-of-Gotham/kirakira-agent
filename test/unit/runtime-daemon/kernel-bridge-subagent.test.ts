import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";
import type { ReactWorkerConfig } from "../../../packages/agent-runtime/src/index.js";
import type { ResolvedConfig } from "../../../packages/core/src/index.js";
import type {
  MemoryBundle,
  MemoryService,
  RecallRequest,
  RetrievalTrace,
} from "../../../packages/memory-core/src/index.js";
import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
import { KernelBridge } from "../../../packages/runtime-daemon/src/bridge/kernel-bridge.js";
import {
  createDaemonDelegateRuntime,
  type DaemonDelegateRuntimeOptions,
} from "../../../packages/runtime-daemon/src/bridge/runtime-deps.js";

function parentConfig(runId = "run-1"): ReactWorkerConfig {
  return {
    id: "worker-parent",
    runId,
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
  };
}

function waitForBridgeEvent(
  bridge: KernelBridge,
  predicate: (event: RunEvent) => boolean,
): Promise<RunEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for bridge event"));
    }, 2_000);
    const unsubscribe = bridge.onEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

const trace: RetrievalTrace = {
  traceId: "trace-1",
  queryId: "query-1",
  normalizedQuery: "daemon research",
  routePlan: ["vector"],
  routes: [
    {
      routeName: "vector",
      candidates: [{ recordId: "rec-1", score: 0.9, rank: 1 }],
      filters: {},
      durationMs: 12,
    },
  ],
  fusionScores: [{ recordId: "rec-1", score: 0.82, selected: true }],
  rerankScores: [{ recordId: "rec-1", score: 0.91, reason: "strong match" }],
  budgetLevel: "L3",
  totalDurationMs: 20,
  createdAt: "2026-06-09T00:00:00.000Z",
};

const bundle: MemoryBundle = {
  id: "bundle-1",
  queryId: "query-1",
  context: {
    queryId: "query-1",
    totalEstimatedTokens: 128,
    levels: {
      l0: {
        level: "L0",
        abstract: "Prior daemon research",
        entityCount: 1,
        estimatedTokens: 16,
      },
      l1: {
        level: "L1",
        factSummaries: ["Fact A"],
        observationSummaries: [],
        stateSummary: "RAW MEMORY CONTENT MUST NOT LEAK",
        estimatedTokens: 32,
      },
      l3: {
        level: "L3",
        evidence: [
          {
            id: "ev-1",
            sourceRecordId: "rec-1",
            rawSpan: "Memory citation excerpt",
            artifactPointer: "artifact://doc-1#L10",
          },
        ],
        estimatedTokens: 64,
      },
    },
  },
  trace,
  recordIds: ["rec-1"],
  totalTokens: 128,
  createdAt: "2026-06-09T00:00:00.000Z",
};

describe("runtime daemon subagent bridge", () => {
  it("creates an EphemeralWorker delegate runner from daemon runtime deps", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-daemon-runtime-"));
    const emitted: RunEvent[] = [];
    const runtime = await createDaemonDelegateRuntime({
      workspaceRoot,
      eventWriter: {
        async emit(event) {
          emitted.push(event);
        },
      },
      modelGateway: {
        async complete() {
          return {
            text: JSON.stringify({
              kind: "final_output",
              output: "daemon child result",
            }),
            model: "test-model",
          };
        },
      },
    });

    try {
      const result = await runtime.delegateRunner({
        subagentId: "sg-1",
        parentWorkerId: "worker-parent",
        parentConfig: parentConfig(),
        runId: "run-1",
        task: "inspect daemon runtime",
        capabilities: [{ kind: "tool", name: "repo.read" }],
        action: {
          kind: "delegate",
          args: { task: "inspect daemon runtime" },
        },
      });

      expect(result).toMatchObject({
        success: true,
        finalText: "daemon child result",
      });
      expect(emitted.map((event) => event.kind)).toEqual(
        expect.arrayContaining(["run.started", "model.request", "run.completed"]),
      );
    } finally {
      await runtime.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("installs the daemon delegate runtime bridge into KernelBridge by default", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-kernel-bridge-"));
    const eventStorePath = join(workspaceRoot, "events");
    const seen: RunEvent[] = [];
    let factoryOptions: DaemonDelegateRuntimeOptions | undefined;
    let closed = false;
    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      kernelOptions: {
        planContext: {
          workspace: workspaceRoot,
          availableTools: ["repo.read"],
          availableSkills: [],
          availableMcpServers: [],
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
                  subagent: { taskBrief: "Inspect repository architecture" },
                },
              ],
              estimatedComplexity: "complex",
              requiresSubagents: true,
            });
          },
        },
      },
      async delegateRuntimeFactory(options) {
        factoryOptions = options;
        return {
          async close() {
            closed = true;
          },
          async delegateRunner(request) {
            await options.eventWriter.emit({
              id: "delegate-event",
              runId: request.runId,
              timestamp: new Date(0).toISOString(),
              kind: "model.response",
              payload: {
                workerId: request.subagentId,
                source: "delegate-runtime",
              },
            });
            expect(request).toMatchObject({
              parentTaskId: "inspect",
              task: "Inspect repository architecture",
              capabilities: [{ kind: "tool", name: "repo.read" }],
            });
            return {
              success: true,
              workerId: "worker-child",
              finalText: "child summary",
            };
          },
        };
      },
    });

    try {
      await bridge.create();
      const unsubscribe = bridge.onEvent((event) => {
        seen.push(event);
      });
      const completed = waitForBridgeEvent(
        bridge,
        (event) => event.kind === "run.completed",
      );

      await bridge.submitRun("Inspect repo", "headless", { workspaceRoot });
      await completed;
      unsubscribe();

      expect(factoryOptions?.workspaceRoot).toBe(workspaceRoot);
      expect(seen).toContainEqual(
        expect.objectContaining({
          kind: "model.response",
          payload: expect.objectContaining({ source: "delegate-runtime" }),
        }),
      );
      expect(seen).toContainEqual(
        expect.objectContaining({
          kind: "subagent.completed",
          payload: expect.objectContaining({
            subagentId: "inspect",
            status: "completed",
            preview: "child summary",
          }),
        }),
      );
    } finally {
      await bridge.destroy();
      await rm(workspaceRoot, { recursive: true, force: true });
    }

    expect(closed).toBe(true);
  });

  it("composes daemon deep research from resolved config and memory recall source", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-kernel-research-"));
    const eventStorePath = join(workspaceRoot, "events");
    const seen: RunEvent[] = [];
    const recallCalls: RecallRequest[] = [];
    const memory: Pick<MemoryService, "recall" | "explainRetrieval"> = {
      async recall(request) {
        recallCalls.push(request);
        return bundle;
      },
      async explainRetrieval() {
        return trace;
      },
    };
    const resolvedConfig = {
      agentToml: {
        deep_research: {
          enabled: true,
          source_policy: "workspace",
          max_depth: 1,
          max_breadth: 1,
          max_tool_calls: 2,
          require_citations: true,
        },
      },
    } as Pick<ResolvedConfig, "agentToml">;
    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      enableDaemonSubagents: false,
      resolvedConfig,
      deepResearch: {
        memory: {
          service: memory,
          tenantId: ({ runId }) => `tenant-${runId}`,
          workspaceId: ({ workspaceRoot: taskWorkspaceRoot }) => taskWorkspaceRoot,
          tokenBudget: 512,
          limit: 3,
        },
      },
      kernelOptions: {
        planContext: {
          workspace: workspaceRoot,
          availableTools: [],
          availableSkills: [],
          availableMcpServers: [],
        },
        planner: {
          async completeText() {
            return JSON.stringify({
              goal: "Collect daemon research",
              steps: [
                {
                  id: "research",
                  description: "Collect daemon memory evidence",
                  kind: "research",
                  dependsOn: [],
                  canParallelize: false,
                  research: {
                    question: "What daemon evidence is available?",
                    requiredSourceKinds: ["memory"],
                  },
                },
              ],
              estimatedComplexity: "moderate",
              requiresSubagents: false,
            });
          },
        },
      },
    });

    try {
      await bridge.create();
      const unsubscribe = bridge.onEvent((event) => {
        seen.push(event);
      });
      const completed = waitForBridgeEvent(
        bridge,
        (event) => event.kind === "run.completed",
      );

      const runId = await bridge.submitRun("Collect daemon research", "headless", {
        workspaceRoot,
      });
      await completed;
      unsubscribe();

      expect(recallCalls).toHaveLength(1);
      expect(recallCalls[0]).toMatchObject({
        tenantId: `tenant-${runId}`,
        workspaceId: workspaceRoot,
        query: "What daemon evidence is available?",
        runId,
        tokenBudget: 512,
        limit: 3,
        level: "L3",
        includeRedacted: false,
      });
      expect(seen.map((event) => event.kind)).toEqual(
        expect.arrayContaining([
          "research.started",
          "research.plan.created",
          "research.citation.added",
          "research.completed",
          "task.completed",
          "run.completed",
        ]),
      );
      const taskCompleted = seen.find(
        (event) => event.kind === "task.completed" && event.payload.taskId === "research",
      );
      expect(taskCompleted?.payload.result).toMatchObject({
        output: {
          status: "evidence_collected",
          sourcePolicy: "workspace",
          requiredSourceKinds: ["memory"],
          evidenceCount: 1,
          citationCount: 1,
          toolCalls: 1,
        },
      });
      const serializedResult = JSON.stringify(taskCompleted?.payload.result);
      expect(serializedResult).not.toContain("RAW MEMORY CONTENT MUST NOT LEAK");
      expect(serializedResult).not.toContain("rawSpan");
    } finally {
      await bridge.destroy();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
