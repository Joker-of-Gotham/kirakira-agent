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
    const resolvedConfig = {
      agentToml: {
        deep_research: {
          enabled: false,
        },
      },
      runtimeState: {
        default_profile: "workbench-host",
        profiles: [
          {
            name: "workbench-host",
            mode: "hybrid",
            mcp_servers: [
              {
                name: "filesystem-core",
                command: "node",
                args: ["filesystem.js", workspaceRoot],
              },
            ],
          },
        ],
      },
    } as Pick<ResolvedConfig, "agentToml" | "runtimeState">;
    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      resolvedConfig,
      runtimeProfileName: "workbench-host",
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
      expect(factoryOptions?.resolvedConfig).toBe(resolvedConfig);
      expect(factoryOptions?.runtimeProfileName).toBe("workbench-host");
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

  it("creates default daemon memory research source from runtime env", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-kernel-default-memory-"));
    const eventStorePath = join(workspaceRoot, "events");
    const recallCalls: RecallRequest[] = [];
    const seen: RunEvent[] = [];
    let factoryCalls = 0;
    const resolvedConfig = {
      agentToml: {
        workspace_name: "default-memory-workspace",
        deep_research: {
          enabled: true,
          source_policy: "workspace",
          max_depth: 1,
          max_breadth: 1,
          max_tool_calls: 2,
          require_citations: true,
        },
      },
      runtimeState: {
        default_profile: "workbench-host",
        profiles: [
          {
            name: "workbench-host",
            mode: "host",
            workspace_root: workspaceRoot,
            services: [
              { name: "postgres" },
              { name: "redis" },
              { name: "minio" },
            ],
          },
        ],
      },
    } as Pick<ResolvedConfig, "agentToml" | "runtimeState">;
    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      enableDaemonSubagents: false,
      resolvedConfig,
      runtimeProfileName: "workbench-host",
      memory: {
        env: {
          DATABASE_URL: "postgres://runtime:runtime@127.0.0.1:15432/runtime",
          REDIS_URL: "redis://127.0.0.1:16379/0",
          QDRANT_URL: "http://127.0.0.1:16333",
          NEO4J_URI: "bolt://127.0.0.1:17687",
          KIRAKIRA_NEO4J_USER: "neo4j-runtime",
          KIRAKIRA_NEO4J_PASSWORD: "neo4j-secret",
          S3_ENDPOINT: "http://127.0.0.1:19000",
          S3_ACCESS_KEY_ID: "minio-access",
          S3_SECRET_ACCESS_KEY: "minio-secret",
        },
        serviceFactory() {
          factoryCalls += 1;
          return {
            async recall(request) {
              recallCalls.push(request);
              return bundle;
            },
            async explainRetrieval() {
              return trace;
            },
          };
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
              goal: "Collect default daemon memory",
              steps: [
                {
                  id: "research",
                  description: "Collect default daemon memory evidence",
                  kind: "research",
                  dependsOn: [],
                  canParallelize: false,
                  research: {
                    question: "What default daemon memory is available?",
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

      const runId = await bridge.submitRun("Collect default daemon memory", "headless", {
        workspaceRoot,
      });
      await completed;
      unsubscribe();

      expect(factoryCalls).toBe(1);
      expect(recallCalls).toHaveLength(1);
      expect(recallCalls[0]).toMatchObject({
        tenantId: "default-memory-workspace",
        workspaceId: workspaceRoot,
        query: "What default daemon memory is available?",
        runId,
        level: "L3",
        includeRedacted: false,
      });
      expect(seen.map((event) => event.kind)).toEqual(
        expect.arrayContaining([
          "memory.recall.started",
          "memory.recall.completed",
          "research.completed",
          "run.completed",
        ]),
      );
      const recallStarted = seen.find((event) => event.kind === "memory.recall.started");
      const recallCompleted = seen.find((event) => event.kind === "memory.recall.completed");
      expect(recallStarted?.runId).toBe(runId);
      expect(recallStarted?.payload).toMatchObject({
        operation: "recall",
        sourceKind: "memory",
        runId,
        researchRunId: `${runId}:research:research`,
        researchTaskId: expect.any(String),
        parentTaskId: "research",
        nodeId: "research",
        tenantId: "default-memory-workspace",
        workspaceId: workspaceRoot,
        level: "L3",
        includeRedacted: false,
        requireCitations: true,
      });
      expect(recallStarted?.payload.queryHash).toEqual(expect.any(String));
      expect(recallStarted?.payload.queryPreview).toBe(
        "What default daemon memory is available?",
      );
      expect(recallCompleted?.payload).toMatchObject({
        operation: "recall",
        sourceKind: "memory",
        runId,
        bundleId: "bundle-1",
        queryId: "query-1",
        retrievalTraceId: "trace-1",
        routeNames: ["vector"],
        selectedRecordIds: ["rec-1"],
        recordIds: ["rec-1"],
        totalTokens: 128,
        budgetLevel: "L3",
        routeCount: 1,
        candidateCount: 1,
        evidenceCount: 1,
        citationCount: 1,
      });
    } finally {
      await bridge.destroy();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("surfaces daemon-owned memory research source failures as bounded runtime events", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-kernel-default-memory-failure-"));
    const eventStorePath = join(workspaceRoot, "events");
    const recallCalls: RecallRequest[] = [];
    const seen: RunEvent[] = [];
    let factoryCalls = 0;
    const resolvedConfig = {
      agentToml: {
        workspace_name: "default-memory-workspace",
        deep_research: {
          enabled: true,
          source_policy: "workspace",
          max_depth: 1,
          max_breadth: 1,
          max_tool_calls: 2,
          require_citations: true,
        },
      },
      runtimeState: {
        default_profile: "workbench-host",
        profiles: [
          {
            name: "workbench-host",
            mode: "host",
            workspace_root: workspaceRoot,
            services: [
              { name: "postgres" },
              { name: "redis" },
              { name: "minio" },
            ],
          },
        ],
      },
    } as Pick<ResolvedConfig, "agentToml" | "runtimeState">;
    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      enableDaemonSubagents: false,
      resolvedConfig,
      runtimeProfileName: "workbench-host",
      memory: {
        env: {
          DATABASE_URL: "postgres://runtime:runtime@127.0.0.1:15432/runtime",
          REDIS_URL: "redis://127.0.0.1:16379/0",
          QDRANT_URL: "http://127.0.0.1:16333",
          NEO4J_URI: "bolt://127.0.0.1:17687",
          KIRAKIRA_NEO4J_USER: "neo4j-runtime",
          KIRAKIRA_NEO4J_PASSWORD: "neo4j-secret",
          S3_ENDPOINT: "http://127.0.0.1:19000",
          S3_ACCESS_KEY_ID: "minio-access",
          S3_SECRET_ACCESS_KEY: "minio-secret",
        },
        serviceFactory() {
          factoryCalls += 1;
          return {
            async recall(request) {
              recallCalls.push(request);
              throw new Error("daemon memory recall unavailable");
            },
            async explainRetrieval() {
              return trace;
            },
          };
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
              goal: "Collect failing daemon memory",
              steps: [
                {
                  id: "research",
                  description: "Collect failing daemon memory evidence",
                  kind: "research",
                  dependsOn: [],
                  canParallelize: false,
                  research: {
                    question: "What happens when daemon memory recall fails?",
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

      const runId = await bridge.submitRun("Collect failing daemon memory", "headless", {
        workspaceRoot,
      });
      await completed;
      unsubscribe();

      expect(factoryCalls).toBe(1);
      expect(recallCalls).toHaveLength(1);
      expect(recallCalls[0]).toMatchObject({
        tenantId: "default-memory-workspace",
        workspaceId: workspaceRoot,
        query: "What happens when daemon memory recall fails?",
        runId,
        level: "L3",
        includeRedacted: false,
      });
      expect(seen.map((event) => event.kind)).toEqual(
        expect.arrayContaining([
          "memory.recall.started",
          "memory.recall.failed",
          "research.source.failed",
          "research.task.failed",
          "research.failed",
          "task.failed",
          "run.completed",
        ]),
      );
      const recallFailed = seen.find((event) => event.kind === "memory.recall.failed");
      expect(recallFailed?.runId).toBe(runId);
      expect(recallFailed?.payload).toMatchObject({
        operation: "recall",
        sourceKind: "memory",
        runId,
        researchRunId: `${runId}:research:research`,
        researchTaskId: expect.any(String),
        parentTaskId: "research",
        nodeId: "research",
        tenantId: "default-memory-workspace",
        workspaceId: workspaceRoot,
        level: "L3",
        includeRedacted: false,
        requireCitations: true,
        error: "daemon memory recall unavailable",
      });
      expect(recallFailed?.payload.queryHash).toEqual(expect.any(String));
      expect(recallFailed?.payload.queryPreview).toBe(
        "What happens when daemon memory recall fails?",
      );
      const researchFailed = seen.find((event) => event.kind === "research.failed");
      expect(researchFailed?.payload).toMatchObject({
        nodeId: "research",
        parentTaskId: "research",
        sourcePolicy: "workspace",
        requiredSourceKinds: ["memory"],
        requireCitations: true,
        errorCode: "Error",
        message: "daemon memory recall unavailable",
      });
      const taskFailed = seen.find((event) => event.kind === "task.failed");
      expect(taskFailed?.payload).toMatchObject({
        taskId: "research",
        nodeId: "research",
        kind: "research",
        error: "daemon memory recall unavailable",
      });
    } finally {
      await bridge.destroy();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("uses memory-backed checkpoint repository from the runtime memory profile unless kernel options override it", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-kernel-memory-checkpoints-"));
    const eventStorePath = join(workspaceRoot, "events");
    let memoryCheckpointFactories = 0;
    let overrideCheckpointFactories = 0;
    const resolvedConfig = {
      agentToml: {
        workspace_name: "checkpoint-workspace",
        deep_research: { enabled: false },
      },
      runtimeState: {
        default_profile: "workbench-host",
        profiles: [
          {
            name: "workbench-host",
            mode: "host",
            workspace_root: workspaceRoot,
            memory: {
              enabled: true,
              services: [{ name: "postgres", url_env: "PROFILE_DATABASE_URL" }],
            },
          },
        ],
      },
    } as Pick<ResolvedConfig, "agentToml" | "runtimeState">;

    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      enableDaemonSubagents: false,
      resolvedConfig,
      runtimeProfileName: "workbench-host",
      memory: {
        env: {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
        },
        checkpointRepositoryFactory() {
          memoryCheckpointFactories += 1;
          return {
            async save() {},
            async load() {
              return undefined;
            },
            async delete() {},
          };
        },
      },
    });

    try {
      await bridge.create();
      expect(memoryCheckpointFactories).toBe(1);
    } finally {
      await bridge.destroy();
    }

    const overrideBridge = new KernelBridge(join(workspaceRoot, "events-override"), {
      workspaceRoot,
      enableDaemonSubagents: false,
      resolvedConfig,
      runtimeProfileName: "workbench-host",
      memory: {
        env: {
          PROFILE_DATABASE_URL: "postgres://profile:secret@profile-pg:15432/profile",
        },
        checkpointRepositoryFactory() {
          overrideCheckpointFactories += 1;
          return {
            async save() {},
            async load() {
              return undefined;
            },
            async delete() {},
          };
        },
      },
      kernelOptions: {
        checkpointRepository: {
          async save() {},
          async load() {
            return undefined;
          },
          async delete() {},
        },
      },
    });

    try {
      await overrideBridge.create();
      expect(overrideCheckpointFactories).toBe(0);
    } finally {
      await overrideBridge.destroy();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
