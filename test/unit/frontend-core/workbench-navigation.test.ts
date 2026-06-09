import { describe, expect, it } from "vitest";
import {
  runtimeDaemonHealth,
  type RunEvent,
  type RuntimeMcpListResult,
} from "../../../packages/runtime-contracts/src/index.js";
import {
  createEmptyRunDashboard,
  createMcpDirectoryView,
  createWorkbenchNavigationView,
  projectRunDashboard,
  type RuntimeTransportStatus,
} from "../../../packages/frontend-core/src/index.js";

const event = (
  kind: RunEvent["kind"],
  payload: Record<string, unknown> = {},
  seq = 1,
): RunEvent => ({
  id: `evt-${seq}`,
  runId: "run-1",
  timestamp: `2026-06-10T01:00:${String(seq).padStart(2, "0")}.000Z`,
  kind,
  payload,
  checkpointSeq: seq,
});

const status = (health: ReturnType<typeof runtimeDaemonHealth>): RuntimeTransportStatus => ({
  mode: "mock",
  state: health.ok ? "healthy" : "unavailable",
  label: "Test runtime",
  health,
});

describe("frontend-core workbench navigation view", () => {
  it("marks runs as approval attention before generic running state", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard("run-1"), [
      event("run.started", {}, 1),
      event("task.started", { taskId: "task-a" }, 2),
      event("approval.requested", { ticketId: "approval-a" }, 3),
    ]);

    const nav = createWorkbenchNavigationView({
      projection,
      mcpDirectory: createMcpDirectoryView(undefined),
      activeView: "runs",
    });

    expect(nav.activeView).toBe("runs");
    expect(nav.items.find((item) => item.id === "runs")).toMatchObject({
      count: 1,
      selected: true,
      status: "approval",
      tone: "warning",
    });
  });

  it("separates agents, research, and systems status summaries", () => {
    const directoryResult: RuntimeMcpListResult = {
      generatedAt: "2026-06-10T01:00:00.000Z",
      servers: [
        {
          name: "filesystem-core",
          health: "healthy",
          toolCount: 2,
          tools: [{ name: "read" }, { name: "write" }],
        },
        {
          name: "memory",
          health: "degraded",
          toolCount: 1,
          error: "Vector index unavailable",
          tools: [{ name: "search" }],
        },
      ],
    };
    const projection = projectRunDashboard(createEmptyRunDashboard("run-1"), [
      event("run.started", {}, 1),
      event("subagent.spawned", { subagentId: "agent-a", role: "researcher" }, 2),
      event("research.started", { researchRunId: "research-a" }, 3),
    ]);

    const nav = createWorkbenchNavigationView({
      projection,
      mcpDirectory: createMcpDirectoryView(directoryResult),
      runtimeStatus: status(runtimeDaemonHealth({
        gateway: true,
        kernel: true,
        socket: true,
        capabilities: {
          artifacts: { state: "enabled" },
          memory: { state: "enabled" },
        },
      })),
      activeView: "systems",
    });

    expect(nav.items.find((item) => item.id === "agents")).toMatchObject({
      count: 1,
      status: "active",
      tone: "active",
    });
    expect(nav.items.find((item) => item.id === "research")).toMatchObject({
      count: 1,
      status: "collecting",
      tone: "active",
    });
    expect(nav.items.find((item) => item.id === "systems")).toMatchObject({
      count: 1,
      selected: true,
      status: "attention",
      tone: "warning",
    });
  });

  it("falls back to runs when given an invalid active view", () => {
    const nav = createWorkbenchNavigationView({
      projection: createEmptyRunDashboard(),
      mcpDirectory: createMcpDirectoryView(undefined),
      activeView: "missing" as never,
    });

    expect(nav.activeView).toBe("runs");
    expect(nav.items.find((item) => item.id === "runs")?.selected).toBe(true);
  });
});
