import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
import {
  createEmptyRunDashboard,
  createRunWorkstream,
  projectRunDashboard,
} from "../../../packages/frontend-core/src/index.js";

const event = (
  kind: RunEvent["kind"],
  payload: Record<string, unknown> = {},
  seq = 1,
): RunEvent => ({
  id: `evt-${seq}`,
  runId: "run-1",
  timestamp: `2026-06-09T00:00:${String(seq).padStart(2, "0")}.000Z`,
  kind,
  payload,
  checkpointSeq: seq,
});

describe("frontend-core run workstream projection", () => {
  it("projects graph tasks into a task-first plan board", () => {
    const events = [
      event("run.created", {}, 1),
      event("run.started", {}, 2),
      event(
        "graph.normalized",
        {
          graphId: "graph-1",
          rootNodeId: "scan",
          nodes: [
            { id: "scan", status: "completed", kind: "inspect", description: "Inspect repo" },
            { id: "build", status: "running", kind: "code", description: "Build UI" },
            { id: "verify", status: "pending", kind: "test", description: "Verify slice" },
          ],
        },
        3,
      ),
    ];
    const projection = projectRunDashboard(createEmptyRunDashboard(), events);
    const workstream = createRunWorkstream(projection, events);

    expect(workstream.columns.find((column) => column.id === "now")?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "task:build",
          title: "Build UI",
          phase: "running",
        }),
      ]),
    );
    expect(workstream.columns.find((column) => column.id === "next")?.cards).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "task:verify" })]),
    );
    expect(workstream.columns.find((column) => column.id === "done")?.cards).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "task:scan" })]),
    );
  });

  it("promotes approvals and failures into the attention strip and detail drawer", () => {
    const events = [
      event("run.created", {}, 1),
      event(
        "task.failed",
        {
          taskId: "build",
          nodeId: "build",
          description: "Build UI",
          error: "Typecheck failed",
        },
        2,
      ),
      event(
        "approval.requested",
        {
          ticketId: "approval-1",
          action: "Apply workstream UI",
          reason: "Human review required",
        },
        3,
      ),
    ];
    const projection = projectRunDashboard(createEmptyRunDashboard(), events);
    const workstream = createRunWorkstream(projection, events, {
      selectedItemId: "attention:approval:approval-1",
    });

    expect(workstream.summary.attentionCount).toBe(2);
    expect(workstream.attention).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "attention:approval:approval-1",
          severity: "critical",
          title: "Apply workstream UI",
        }),
        expect.objectContaining({
          id: "attention:task:build",
          detail: "Typecheck failed",
        }),
      ]),
    );
    expect(workstream.columns.find((column) => column.id === "blocked")?.cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "task:build", phase: "failed" }),
        expect.objectContaining({ id: "approval:approval-1", phase: "requested" }),
      ]),
    );
    expect(workstream.detail).toMatchObject({
      id: "attention:approval:approval-1",
      kind: "attention",
      summary: "Human review required",
    });
  });

  it("keeps inline activity bounded and newest first", () => {
    const events = [
      event("run.created", {}, 1),
      event("run.started", {}, 2),
      event("checkpoint.saved", { checkpointId: "checkpoint-1" }, 3),
    ];
    const projection = projectRunDashboard(createEmptyRunDashboard(), events);
    const workstream = createRunWorkstream(projection, events, { maxActivityItems: 2 });

    expect(workstream.activity).toHaveLength(2);
    expect(workstream.activity[0]).toMatchObject({
      eventId: "evt-3",
      title: "Checkpoint saved",
    });
    expect(workstream.activity[1]).toMatchObject({
      eventId: "evt-2",
      title: "Run started",
    });
  });
});
