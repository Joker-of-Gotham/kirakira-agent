import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/event-store/src/index.js";
import {
  createEmptyRunDashboard,
  projectRunDashboard,
} from "../../../packages/frontend-core/src/index.js";

const event = (
  kind: RunEvent["kind"],
  payload: Record<string, unknown> = {},
  seq = 1,
): RunEvent => ({
  id: `evt-${seq}`,
  runId: "run-1",
  timestamp: `2026-06-08T00:00:${String(seq).padStart(2, "0")}.000Z`,
  kind,
  payload,
  checkpointSeq: seq,
});

describe("frontend-core run dashboard projection", () => {
  it("projects lifecycle, subagents, tools, and approvals without runtime dependencies", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event("run.created", {}, 1),
      event("run.started", {}, 2),
      event("subagent.spawned", { subagentId: "agent-a" }, 3),
      event("tool.call.started", { callId: "tool-a" }, 4),
      event("approval.requested", { ticketId: "approval-a" }, 5),
      event("approval.resolved", { ticketId: "approval-a" }, 6),
      event("tool.call.completed", { callId: "tool-a" }, 7),
      event("subagent.completed", { subagentId: "agent-a" }, 8),
      event("run.completed", {}, 9),
    ]);

    expect(projection.runId).toBe("run-1");
    expect(projection.status).toBe("completed");
    expect(projection.entities.subagents["agent-a"]).toBe("completed");
    expect(projection.entities.tools["tool-a"]).toBe("completed");
    expect(projection.entities.approvals["approval-a"]).toBe("resolved");
    expect(projection.pendingApprovalIds).toEqual([]);
    expect(projection.latestEvents[0]?.kind).toBe("run.completed");
  });

  it("keeps latest events bounded", () => {
    const projection = projectRunDashboard(
      createEmptyRunDashboard("run-1"),
      [event("run.created", {}, 1), event("run.started", {}, 2)],
      { latestEventLimit: 1 },
    );

    expect(projection.latestEvents).toHaveLength(1);
    expect(projection.latestEvents[0]?.kind).toBe("run.started");
  });

  it("projects failed subagent completions as failed dashboard entities", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event("subagent.spawned", { subagentId: "agent-a" }, 1),
      event(
        "subagent.completed",
        { subagentId: "agent-a", status: "failed", error: "boom" },
        2,
      ),
    ]);

    expect(projection.entities.subagents["agent-a"]).toBe("failed");
  });
});
