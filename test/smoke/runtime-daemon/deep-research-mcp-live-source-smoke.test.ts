import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
import { KernelBridge } from "../../../packages/runtime-daemon/src/bridge/kernel-bridge.js";
import {
  DEEP_RESEARCH_HTTP_SERVER,
  DEEP_RESEARCH_LIVE_MCP_TOOL,
  DEEP_RESEARCH_LIVE_RETRIEVED_AT,
  DEEP_RESEARCH_STDIO_SERVER,
  startDeepResearchLiveMcpFixture,
  type DeepResearchLiveMcpFixture,
} from "../../helpers/deep-research-live-mcp.js";

describe("KernelBridge deep research live MCP source gate", () => {
  const fixtures: DeepResearchLiveMcpFixture[] = [];
  const bridges: KernelBridge[] = [];
  const workspaces: string[] = [];

  afterEach(async () => {
    await Promise.allSettled(bridges.splice(0).map((bridge) => bridge.destroy()));
    await Promise.allSettled(fixtures.splice(0).map((fixture) => fixture.close()));
    await Promise.allSettled(
      workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
    );
  });

  it("emits research events from a live daemon MCP source through KernelBridge", async () => {
    const fixture = await startDeepResearchLiveMcpFixture();
    fixtures.push(fixture);
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-kernel-mcp-research-"));
    workspaces.push(workspaceRoot);
    const eventStorePath = join(workspaceRoot, "events");
    const seen: RunEvent[] = [];
    const bridge = new KernelBridge(eventStorePath, {
      workspaceRoot,
      enableDaemonSubagents: false,
      deepResearch: {
        config: {
          enabled: true,
          source_policy: "verified",
          max_depth: 1,
          max_breadth: 2,
          max_tool_calls: 1,
          require_citations: true,
        },
        mcp: {
          port: fixture.runtime,
          targets: fixture.targets,
          retrievedAt: DEEP_RESEARCH_LIVE_RETRIEVED_AT,
        },
      },
      kernelOptions: {
        planner: {
          async completeText() {
            return JSON.stringify({
              goal: "Collect live MCP research evidence",
              steps: [
                {
                  id: "research-mcp",
                  description: "Collect live MCP research evidence",
                  kind: "research",
                  dependsOn: [],
                  canParallelize: false,
                  research: {
                    question: "Collect live MCP evidence for KernelBridge",
                    requiredSourceKinds: ["mcp"],
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
    bridges.push(bridge);

    await bridge.create();
    const unsubscribe = bridge.onEvent((event) => {
      seen.push(event);
    });
    const completed = waitForBridgeEvent(bridge, (event) => event.kind === "run.completed");
    const runId = await bridge.submitRun("Collect live MCP research evidence", "headless", {
      workspaceRoot,
    });

    await completed;
    unsubscribe();

    const kinds = seen.map((event) => event.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "task.started",
        "research.started",
        "research.plan.created",
        "research.task.started",
        "research.source.started",
        "research.source.completed",
        "research.evidence.collected",
        "research.citation.added",
        "research.task.completed",
        "research.completed",
        "task.completed",
        "run.completed",
      ]),
    );
    expect(kinds).not.toContain("research.failed");
    expect(kinds).not.toContain("task.failed");

    const taskStarted = eventOf(seen, "task.started", "research-mcp");
    expect(taskStarted).toMatchObject({
      runId,
      payload: {
        taskId: "research-mcp",
        kind: "research",
        lane: "background",
      },
    });

    const researchStarted = eventOf(seen, "research.started");
    expect(researchStarted).toMatchObject({
      runId,
      payload: {
        researchRunId: `${runId}:research-mcp:research`,
        nodeId: "research-mcp",
        parentTaskId: "research-mcp",
        requiredSourceKinds: ["mcp"],
        sourcePolicy: "verified",
        requireCitations: true,
      },
    });
    expect(researchStarted?.payload.traceId).toEqual(expect.any(String));

    const sourceStarted = eventOf(seen, "research.source.started");
    expect(sourceStarted?.payload).toMatchObject({
      sourceKind: "mcp",
      toolCalls: 1,
      maxToolCalls: 1,
      requireCitations: true,
    });
    expect(sourceStarted?.payload.sourceCallId).toEqual(expect.any(String));

    const sourceCompleted = eventOf(seen, "research.source.completed");
    expect(sourceCompleted?.payload).toMatchObject({
      sourceKind: "mcp",
      evidenceCount: 2,
      citationCount: 2,
    });
    expect(sourceCompleted?.payload.evidenceIds).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(sourceCompleted?.payload.citationIds).toEqual(
      expect.arrayContaining(["stdio-citation", "http-citation"]),
    );

    const citationUris = seen
      .filter((event) => event.kind === "research.citation.added")
      .map((event) => event.payload.uri)
      .sort();
    expect(citationUris).toEqual([
      "mcp+smoke://http/research-evidence",
      "mcp+smoke://stdio/research-evidence",
    ]);
    const httpCitation = seen.find(
      (event) =>
        event.kind === "research.citation.added" &&
        event.payload.uri === "mcp+smoke://http/research-evidence",
    );
    expect(httpCitation?.payload).toMatchObject({
      sourceKind: "mcp",
      sourceRecordId: `${DEEP_RESEARCH_HTTP_SERVER}:${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
      metadata: expect.objectContaining({
        server: DEEP_RESEARCH_HTTP_SERVER,
        tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
        policyEffect: "allow",
        decisionId: "decision-deep-research-live",
        liveTransport: "http",
        otelSpanName: `tools/call ${DEEP_RESEARCH_LIVE_MCP_TOOL}`,
      }),
    });

    const taskCompleted = eventOf(seen, "task.completed", "research-mcp");
    expect(taskCompleted?.payload.result).toMatchObject({
      output: {
        status: "evidence_collected",
        sourcePolicy: "verified",
        requiredSourceKinds: ["mcp"],
        evidenceCount: 2,
        citationCount: 2,
        toolCalls: 1,
      },
    });
    const serializedResult = JSON.stringify(taskCompleted?.payload.result);
    expect(serializedResult).toContain("mcp+smoke://stdio/research-evidence");
    expect(serializedResult).toContain("mcp+smoke://http/research-evidence");
    expect(serializedResult).not.toContain("traceFlags");

    const httpToolCall = fixture.httpRequests.find((request) => request.method === "tools/call");
    expect(httpToolCall).toMatchObject({
      method: "tools/call",
      params: {
        name: DEEP_RESEARCH_LIVE_MCP_TOOL,
        arguments: {
          query: "Collect live MCP evidence for KernelBridge",
          taskId: expect.any(String),
          sourceKind: "mcp",
          limits: {
            maxDepth: 1,
            maxBreadth: 2,
            maxToolCalls: 1,
          },
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
  });
});

function waitForBridgeEvent(
  bridge: KernelBridge,
  predicate: (event: RunEvent) => boolean,
): Promise<RunEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for bridge event"));
    }, 5_000);
    const unsubscribe = bridge.onEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

function eventOf(
  events: RunEvent[],
  kind: RunEvent["kind"],
  taskId?: string,
): RunEvent | undefined {
  return events.find(
    (event) =>
      event.kind === kind &&
      (taskId === undefined || event.payload.taskId === taskId),
  );
}
