import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
import {
  createEmptyRunDashboard,
  createRunInspector,
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

describe("frontend-core run inspector projection", () => {
  it("summarizes lifecycle, graph, subagent, research, and approval lanes", () => {
    const dashboard = projectRunDashboard(createEmptyRunDashboard(), [
      event("run.created", {}, 1),
      event("run.started", {}, 2),
      event(
        "graph.normalized",
        {
          graphId: "graph-1",
          totalNodes: 2,
          completedNodes: 1,
          runningNodes: 1,
          nodes: [
            { id: "scan", status: "completed", description: "Scan" },
            { id: "research", status: "running", description: "Research" },
          ],
        },
        3,
      ),
      event(
        "subagent.spawned",
        {
          subagentId: "agent-a",
          role: "implementer",
          lane: "delegated",
          requestedLane: "delegated",
          taskPreview: "Review runtime UI",
          capabilities: [{ kind: "skill", name: "frontend-ui-engineering" }],
        },
        4,
      ),
      event(
        "research.started",
        {
          researchRunId: "research-a",
          question: "Which UI state belongs in the shared projection?",
          requiredSourceKinds: ["docs", "repo"],
        },
        5,
      ),
      event(
        "research.citation.added",
        {
          researchRunId: "research-a",
          citationId: "citation-a",
          title: "ARIA live regions",
          uri: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions",
        },
        6,
      ),
      event("approval.requested", { ticketId: "approval-a" }, 7),
      event("checkpoint.saved", { checkpointId: "checkpoint-a", checkpointSeq: 7 }, 8),
    ]);

    const inspector = createRunInspector(dashboard, {
      selectedFocusId: "research:research-a",
    });

    expect(inspector.runId).toBe("run-1");
    expect(inspector.checkpoint).toEqual({ id: "checkpoint-a", seq: 7 });
    expect(inspector.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "graph", count: 2, activeCount: 1, phase: "running" }),
        expect.objectContaining({ id: "subagents", count: 1, activeCount: 1 }),
        expect.objectContaining({ id: "research", count: 1, activeCount: 1 }),
        expect.objectContaining({ id: "approvals", count: 1, phase: "requested" }),
      ]),
    );
    expect(inspector.selectedFocus).toMatchObject({
      id: "research:research-a",
      kind: "research",
      phase: "running",
      summary: "ARIA live regions",
    });
    expect(inspector.focusItems.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "run:lifecycle",
        "run:graph",
        "subagent:agent-a",
        "research:research-a",
        "approval:approval-a",
      ]),
    );
    expect(inspector.focusItems.find((item) => item.id === "subagent:agent-a")?.details)
      .toEqual(expect.arrayContaining([
        { label: "Role", value: "implementer" },
        { label: "Lane", value: "delegated" },
        { label: "Requested lane", value: "delegated" },
      ]));
  });

  it("falls back to lifecycle focus when the selected item is unavailable", () => {
    const dashboard = projectRunDashboard(createEmptyRunDashboard(), [
      event("run.created", {}, 1),
    ]);

    const inspector = createRunInspector(dashboard, {
      selectedFocusId: "subagent:missing",
    });

    expect(inspector.selectedFocusId).toBe("run:lifecycle");
    expect(inspector.selectedFocus?.kind).toBe("run");
  });

  it("surfaces artifact details as selectable focus records", () => {
    const dashboard = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "artifact.created",
        {
          artifactId: "artifact-a",
          path: "artifacts/report.md",
          kind: "markdown",
          title: "Research report",
          summary: "Compiled research output",
          metadata: { bytes: 512, reviewed: false, nested: { drop: true } },
        },
        1,
      ),
    ]);

    const inspector = createRunInspector(dashboard, {
      selectedFocusId: "artifact:artifact-a",
    });

    expect(inspector.lanes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "artifacts", count: 1, activeCount: 1 }),
      ]),
    );
    expect(inspector.selectedFocus).toMatchObject({
      id: "artifact:artifact-a",
      kind: "artifact",
      label: "Research report",
      phase: "created",
      summary: "Compiled research output",
    });
    expect(inspector.selectedFocus?.details).toEqual(
      expect.arrayContaining([
        { label: "Path", value: "artifacts/report.md" },
        { label: "Metadata", value: "bytes=512, reviewed=false" },
      ]),
    );
  });

  it("keeps the empty state explicit before the first runtime event", () => {
    const inspector = createRunInspector(createEmptyRunDashboard());

    expect(inspector.empty).toBe(true);
    expect(inspector.focusItems).toHaveLength(1);
    expect(inspector.lanes).toContainEqual(
      expect.objectContaining({ id: "lifecycle", count: 0, activeCount: 0 }),
    );
    expect(inspector.selectedFocus).toMatchObject({
      id: "run:lifecycle",
      summary: "Waiting for runtime events",
    });
  });
});
