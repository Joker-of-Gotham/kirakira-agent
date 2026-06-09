import { describe, expect, it } from "vitest";
import type {
  RuntimeMcpListResult,
  RunEvent,
} from "@kirakira/runtime-contracts";
import {
  createEmptyRunDashboard,
  createMcpDirectoryView,
  createMcpToolPlaygroundView,
  createRunActivityRailView,
  createRunInspector,
  createRunWorkstream,
  projectRunDashboard,
} from "../../../packages/frontend-core/src/index.js";

const event = (
  kind: RunEvent["kind"],
  payload: Record<string, unknown> = {},
  seq = 1,
): RunEvent => ({
  id: `evt-${seq}`,
  runId: "run-activity",
  timestamp: `2026-06-09T01:00:${String(seq).padStart(2, "0")}.000Z`,
  kind,
  payload,
  checkpointSeq: seq,
});

describe("frontend-core activity rail view", () => {
  it("projects selected workstream detail, subagent detail, and bounded activity", () => {
    const events = [
      event("run.created", {}, 1),
      event("run.started", {}, 2),
      event(
        "subagent.spawned",
        {
          subagentId: "agent-research",
          role: "researcher",
          lane: "delegated",
          taskPreview: "Collect runtime evidence",
          traceId: "trace-activity",
        },
        3,
      ),
      event(
        "task.started",
        {
          taskId: "research-task",
          nodeId: "research-task",
          kind: "subagent",
          description: "Collect runtime evidence",
          workerId: "agent-research",
        },
        4,
      ),
      event(
        "tool.call.started",
        {
          callId: "docs-call",
          toolId: "docs.search",
          summary: "Search docs",
        },
        5,
      ),
    ];
    const projection = projectRunDashboard(createEmptyRunDashboard(), events);
    const workstream = createRunWorkstream(projection, events, {
      selectedItemId: "subagent:agent-research",
    });
    const inspector = createRunInspector(projection, {
      selectedFocusId: "subagent:agent-research",
    });

    const rail = createRunActivityRailView({
      workstream,
      inspector,
      maxActivityItems: 2,
    });

    expect(rail.metrics.map((item) => [item.id, item.value])).toContainEqual([
      "active",
      "4",
    ]);
    expect(rail.activity).toHaveLength(2);
    expect(rail.activity[0]?.eventId).toBe("evt-5");
    expect(rail.selected).toMatchObject({
      id: "subagent:agent-research",
      kind: "subagent",
      summary: "running",
    });
    expect(rail.subagent).toMatchObject({
      id: "subagent:agent-research",
      kind: "subagent",
      summary: "Collect runtime evidence",
    });
  });

  it("projects selected MCP tool details from the playground view-model", () => {
    const discovery: RuntimeMcpListResult = {
      servers: [
        {
          name: "workspace-tools",
          health: "healthy",
          tools: [
            {
              name: "search_notes",
              title: "Search notes",
              description: "Search runtime notes",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  limit: { type: "number" },
                },
                required: ["query"],
              },
            },
          ],
        },
      ],
    };
    const playground = createMcpToolPlaygroundView(
      createMcpDirectoryView(discovery).tools[0],
    );
    const projection = projectRunDashboard(createEmptyRunDashboard(), []);
    const workstream = createRunWorkstream(projection, []);
    const inspector = createRunInspector(projection);

    const rail = createRunActivityRailView({
      workstream,
      inspector,
      mcpPlayground: playground,
    });

    expect(rail.mcpTool).toMatchObject({
      id: "workspace-tools:search_notes",
      server: "workspace-tools",
      name: "search_notes",
      title: "Search notes",
      inputSummary: "2 fields, 1 required",
      draftStatus: "ready",
    });
    expect(rail.mcpTool?.schemaText).toContain("\"query\"");
  });
});
