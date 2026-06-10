import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { DelegateRequest } from "../../../packages/agent-runtime/src/loop/react-loop.js";
import type { ConfigLayer, ResolvedConfig } from "../../../packages/config-resolver/src/types.js";
import { resolveConfig } from "../../../packages/config-resolver/src/resolved-state.js";
import type {
  MemoryBundle,
  MemoryService,
  RecallRequest,
  RetrievalTrace,
} from "../../../packages/memory-core/src/index.js";
import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
import { KernelBridge } from "../../../packages/runtime-daemon/src/bridge/kernel-bridge.js";
import type { DaemonDelegateRuntimeOptions } from "../../../packages/runtime-daemon/src/bridge/runtime-deps.js";
import {
  DEEP_RESEARCH_HTTP_SERVER,
  DEEP_RESEARCH_LIVE_MCP_TOOL,
  DEEP_RESEARCH_STDIO_SERVER,
  startDeepResearchLiveMcpFixture,
} from "../../helpers/deep-research-live-mcp.js";
import { getRepoRoot } from "../../helpers/repo-root.js";

const repoRoot = getRepoRoot(import.meta.url);
const runtimeProfilesPath = join(repoRoot, "configs", "runtime", "profiles.json");

function runtimeProfilesConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(runtimeProfilesPath, "utf8")) as Record<string, unknown>;
}

function repoLayer(data: ConfigLayer["data"] = {}): ConfigLayer {
  return {
    name: "repo",
    path: join(repoRoot, "agent.toml"),
    data,
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
    }, 8_000);
    const unsubscribe = bridge.onEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

const trace: RetrievalTrace = {
  traceId: "trace-composition-memory",
  queryId: "query-composition-memory",
  normalizedQuery: "runtime daemon composition",
  routePlan: ["vector"],
  routes: [
    {
      routeName: "vector",
      candidates: [{ recordId: "memory-record-composition", score: 0.93, rank: 1 }],
      filters: {},
      durationMs: 11,
    },
  ],
  fusionScores: [{ recordId: "memory-record-composition", score: 0.88, selected: true }],
  rerankScores: [{ recordId: "memory-record-composition", score: 0.9, reason: "composition evidence" }],
  budgetLevel: "L3",
  totalDurationMs: 18,
  createdAt: "2026-06-10T00:00:00.000Z",
};

const bundle: MemoryBundle = {
  id: "bundle-composition-memory",
  queryId: "query-composition-memory",
  context: {
    queryId: "query-composition-memory",
    totalEstimatedTokens: 96,
    levels: {
      l0: {
        level: "L0",
        abstract: "Runtime daemon composition memory summary",
        entityCount: 1,
        estimatedTokens: 12,
      },
      l1: {
        level: "L1",
        factSummaries: ["The composition gate must exercise memory recall in the daemon run."],
        observationSummaries: [],
        stateSummary: "RAW COMPOSITION MEMORY MUST NOT LEAK",
        estimatedTokens: 24,
      },
      l3: {
        level: "L3",
        evidence: [
          {
            id: "memory-evidence-composition",
            sourceRecordId: "memory-record-composition",
            rawSpan: "Memory citation excerpt for daemon composition",
            artifactPointer: "artifact://composition/memory#L10",
          },
        ],
        estimatedTokens: 48,
      },
    },
  },
  trace,
  recordIds: ["memory-record-composition"],
  totalTokens: 96,
  createdAt: "2026-06-10T00:00:00.000Z",
};

describe("runtime daemon composition smoke", () => {
  it("proves subagent, deep research, MCP, memory, and checkpoint wiring in one KernelBridge run", async () => {
    const fixture = await startDeepResearchLiveMcpFixture();
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-daemon-composition-"));
    const eventStorePath = join(workspaceRoot, "events");
    const seen: RunEvent[] = [];
    const recallCalls: RecallRequest[] = [];
    const delegateRequests: DelegateRequest[] = [];
    const checkpoints = new Map<string, unknown>();
    let factoryOptions: DaemonDelegateRuntimeOptions | undefined;
    let delegateRuntimeClosed = false;

    const profiles = runtimeProfilesConfig();
    profiles.deepResearch = {
      ...(profiles.deepResearch as Record<string, unknown>),
      mcp: {
        inlineTargets: fixture.targets,
        includeErrorEvidence: true,
        maxEvidence: 4,
      },
    };
    const resolved = resolveConfig([repoLayer({
      deep_research: {
        enabled: true,
        source_policy: "verified",
        max_depth: 1,
        max_breadth: 4,
        max_tool_calls: 2,
        require_citations: true,
      },
    })], undefined, undefined, {
      runtimeProfilesConfig: profiles,
      runtimeProfilesPath,
      runtimeEnv: {
        KIRAKIRA_WORKSPACE_ROOT: workspaceRoot,
        KIRAKIRA_APP_ROOT: repoRoot,
      },
    }) as Pick<ResolvedConfig, "agentToml" | "runtimeState">;
    const profile = resolved.runtimeState.profiles.find((candidate) => candidate.name === "workbench-host");
    expect(profile?.orchestration?.handoff_mode).toBe("swarm");
    expect(profile?.orchestration?.default_role).toBe("supervisor");
    expect(profile?.deep_research?.mcp?.targets?.map((target) => target.server).sort()).toEqual([
      DEEP_RESEARCH_HTTP_SERVER,
      DEEP_RESEARCH_STDIO_SERVER,
    ].sort());

    const memory: Pick<MemoryService, "recall" | "explainRetrieval"> = {
      async recall(request) {
        recallCalls.push(request);
        return bundle;
      },
      async explainRetrieval() {
        return trace;
      },
    };

    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      resolvedConfig: resolved,
      runtimeProfileName: "workbench-host",
      deepResearchMcpPort: fixture.runtime,
      deepResearch: {
        memory: {
          service: memory,
          tenantId: ({ runId }) => `tenant-${runId}`,
          workspaceId: ({ workspaceRoot: taskWorkspaceRoot }) => taskWorkspaceRoot,
          namespace: "agent",
          kinds: ["fact", "observation"],
          sessionId: ({ runId, node }) => `session-${runId}-${node.id}`,
          tokenBudget: 512,
          limit: 2,
          includeRedacted: true,
        },
      },
      async delegateRuntimeFactory(options) {
        factoryOptions = options;
        return fakeDelegateRuntime(options, delegateRequests, () => {
          delegateRuntimeClosed = true;
        });
      },
      kernelOptions: {
        checkpointRepository: {
          async save(envelope) {
            checkpoints.set(envelope.id, envelope);
          },
          async load(id) {
            return checkpoints.get(id) as never;
          },
          async delete(id) {
            checkpoints.delete(id);
          },
        },
        checkpointDurability: "async",
        planContext: {
          workspace: workspaceRoot,
          availableTools: ["repo.read"],
          availableSkills: [],
          availableMcpServers: profile?.mcp_servers?.map((server) => server.name) ?? [],
          orchestration: profile?.orchestration,
        },
        planner: {
          async completeText() {
            return JSON.stringify({
              goal: "Prove runtime daemon composition",
              steps: [
                {
                  id: "delegate-implementation",
                  description: "Delegate bounded implementation audit",
                  kind: "subagent",
                  dependsOn: [],
                  canParallelize: false,
                  toolScope: ["repo.read"],
                  subagent: {
                    role: "implementer",
                    taskBrief: "Audit bounded runtime composition implementation",
                  },
                },
                {
                  id: "research-composition",
                  description: "Collect memory and MCP composition evidence",
                  kind: "research",
                  dependsOn: ["delegate-implementation"],
                  canParallelize: false,
                  research: {
                    question: "Collect runtime daemon composition evidence",
                    requiredSourceKinds: ["memory", "mcp"],
                  },
                },
              ],
              estimatedComplexity: "complex",
              requiresSubagents: true,
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
      const completed = waitForBridgeEvent(bridge, (event) => event.kind === "run.completed");
      const runId = await bridge.submitRun("Prove runtime daemon composition", "headless", {
        workspaceRoot,
      });
      await completed;
      unsubscribe();

      const kinds = seen.map((event) => event.kind);
      expect(kinds).toEqual(
        expect.arrayContaining([
          "subagent.spawned",
          "subagent.completed",
          "memory.recall.started",
          "memory.recall.completed",
          "research.started",
          "research.source.started",
          "research.source.completed",
          "research.evidence.collected",
          "research.citation.added",
          "checkpoint.saved",
          "run.completed",
        ]),
      );
      expect(kinds).not.toContain("task.failed");
      expect(kinds).not.toContain("research.failed");
      expect(kinds).not.toContain("run.failed");

      expect(factoryOptions).toMatchObject({
        workspaceRoot,
        runtimeProfileName: "workbench-host",
      });
      expect(delegateRuntimeClosed).toBe(false);
      expect(delegateRequests).toHaveLength(1);
      expect(delegateRequests[0]).toMatchObject({
        parentTaskId: "delegate-implementation",
        task: "Audit bounded runtime composition implementation",
        role: "implementer",
        lane: "delegated",
        requestedLane: "delegated",
        permissions: ["edit", "test", "artifact"],
        capabilities: [{ kind: "tool", name: "repo.read" }],
        topology: {
          parentRole: "supervisor",
          handoff: expect.objectContaining({
            from: "supervisor",
            to: "implementer",
            mode: "tool",
            inputFilter: "scoped-task-brief",
          }),
        },
        lineage: expect.objectContaining({
          rootLineageId: runId,
          lineageId: `${runId}:task:delegate-implementation:subagent`,
        }),
      });

      const subagentSpawned = eventOf(seen, "subagent.spawned", "delegate-implementation");
      expect(subagentSpawned?.payload).toMatchObject({
        role: "implementer",
        lane: "delegated",
        requestedLane: "delegated",
        permissions: ["edit", "test", "artifact"],
        parentRole: "supervisor",
        handoff: expect.objectContaining({
          inputFilter: "scoped-task-brief",
        }),
      });

      expect(recallCalls).toHaveLength(1);
      expect(recallCalls[0]).toMatchObject({
        runId,
        query: "Collect runtime daemon composition evidence",
        workspaceId: workspaceRoot,
        namespace: "agent",
        kinds: ["fact", "observation"],
        tokenBudget: 512,
        limit: 2,
        includeRedacted: true,
      });
      expect(checkpoints.size).toBeGreaterThan(0);
      const checkpointSaved = seen.find((event) => event.kind === "checkpoint.saved");
      expect(checkpointSaved?.payload.checkpointId).toEqual(expect.any(String));

      const mcpCitation = seen.find(
        (event) =>
          event.kind === "research.citation.added" &&
          event.payload.uri === "mcp+smoke://http/research-evidence",
      );
      expect(mcpCitation?.payload).toMatchObject({
        sourceKind: "mcp",
        sourceRecordId: `${DEEP_RESEARCH_HTTP_SERVER}:${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
        metadata: expect.objectContaining({
          server: DEEP_RESEARCH_HTTP_SERVER,
          tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
          policyEffect: "allow",
          decisionId: "decision-deep-research-live",
          trustTier: "verified",
          liveTransport: "http",
          otelSpanName: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
        }),
      });
      const mcpCitationUris = seen
        .filter((event) => event.kind === "research.citation.added" && event.payload.sourceKind === "mcp")
        .map((event) => event.payload.uri)
        .sort();
      expect(mcpCitationUris).toEqual([
        "mcp+smoke://http/research-evidence",
        "mcp+smoke://stdio/research-evidence",
      ]);
      const mcpCitationTransports = seen
        .filter((event) => event.kind === "research.citation.added" && event.payload.sourceKind === "mcp")
        .map((event) => (event.payload.metadata as Record<string, unknown> | undefined)?.liveTransport)
        .sort();
      expect(mcpCitationTransports).toEqual(["http", "stdio"]);
      const researchCompleted = eventOf(seen, "task.completed", "research-composition");
      expect(researchCompleted?.payload.result).toMatchObject({
        output: {
          status: "evidence_collected",
          requiredSourceKinds: ["memory", "mcp"],
          evidence: expect.arrayContaining([
            expect.objectContaining({
              sourceKind: "memory",
              metadata: expect.objectContaining({
                bundleId: "bundle-composition-memory",
              }),
            }),
            expect.objectContaining({
              sourceKind: "mcp",
              metadata: expect.objectContaining({
                server: DEEP_RESEARCH_HTTP_SERVER,
                liveTransport: "http",
              }),
            }),
            expect.objectContaining({
              sourceKind: "mcp",
              metadata: expect.objectContaining({
                server: DEEP_RESEARCH_STDIO_SERVER,
                liveTransport: "stdio",
              }),
            }),
          ]),
          citations: expect.arrayContaining([
            expect.objectContaining({
              sourceKind: "memory",
              artifactPointer: "artifact://composition/memory#L10",
            }),
            expect.objectContaining({
              sourceKind: "mcp",
              uri: "mcp+smoke://http/research-evidence",
            }),
            expect.objectContaining({
              sourceKind: "mcp",
              uri: "mcp+smoke://stdio/research-evidence",
            }),
          ]),
        },
      });
      expect(JSON.stringify(seen)).not.toContain("RAW COMPOSITION MEMORY MUST NOT LEAK");

      const httpToolCall = fixture.httpRequests.find((request) => request.method === "tools/call");
      expect(httpToolCall).toMatchObject({
        method: "tools/call",
        params: {
          name: DEEP_RESEARCH_LIVE_MCP_TOOL,
          arguments: {
            query: "Collect runtime daemon composition evidence",
            sourceKind: "mcp",
            requireCitations: true,
          },
        },
      });
      expect(fixture.exporter.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
            attributes: expect.objectContaining({
              "mcp.server.name": DEEP_RESEARCH_STDIO_SERVER,
              "mcp.protocol.version": "2025-11-25",
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": DEEP_RESEARCH_LIVE_MCP_TOOL,
              "kirakira.run.id": runId,
            }),
          }),
          expect.objectContaining({
            name: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
            attributes: expect.objectContaining({
              "mcp.server.name": DEEP_RESEARCH_HTTP_SERVER,
              "mcp.protocol.version": "2025-11-25",
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": DEEP_RESEARCH_LIVE_MCP_TOOL,
              "kirakira.run.id": runId,
            }),
          }),
        ]),
      );
    } finally {
      await bridge.destroy();
      expect(delegateRuntimeClosed).toBe(true);
      await fixture.close();
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

function fakeDelegateRuntime(
  options: DaemonDelegateRuntimeOptions,
  requests: DelegateRequest[],
  onClose: () => void,
) {
  return {
    async close() {
      onClose();
    },
    async delegateRunner(request) {
      requests.push(request);
      await options.eventWriter.emit({
        id: "delegate-composition-event",
        runId: request.runId,
        timestamp: new Date(0).toISOString(),
        kind: "model.response",
        payload: {
          workerId: request.subagentId,
          source: "delegate-runtime",
          role: request.role,
          requestedLane: request.requestedLane,
          topology: request.topology,
        },
      });
      return {
        success: true,
        workerId: "worker-composition-child",
        finalText: "composition delegate complete",
        artifactRefs: ["artifact://composition/subagent"],
      };
    },
  };
}

function eventOf(
  events: RunEvent[],
  kind: RunEvent["kind"],
  taskId?: string,
): RunEvent | undefined {
  return events.find(
    (event) =>
      event.kind === kind &&
      (taskId === undefined || event.payload.taskId === taskId || event.payload.subagentId === taskId),
  );
}
