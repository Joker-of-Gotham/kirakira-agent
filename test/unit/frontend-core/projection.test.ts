import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/runtime-contracts/src/index.js";
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

  it("projects subagent topology details without replacing phase maps", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "subagent.spawned",
        {
          subagentId: "agent-a",
          parentTaskId: "task-parent",
          parentWorkerId: "worker-parent",
          role: "implementer",
          lane: "delegated",
          requestedLane: "delegated",
          traceId: "trace-1",
          taskPreview: "Inspect repo",
          capabilities: [
            { kind: "tool", name: "repo.read" },
            { kind: "skill", name: "research" },
            { kind: "mcp", name: "filesystem" },
          ],
          modelPreference: "openai:gpt-5.4",
          runtimePolicy: { maxTurns: 8 },
          policyCeiling: { network: "restricted" },
          inputArtifactRefs: ["artifact-source"],
          outputSchema: { type: "object" },
        },
        1,
      ),
      event(
        "subagent.completed",
        {
          subagentId: "agent-a",
          workerId: "worker-child",
          status: "completed",
          preview: "child output",
          artifactRefs: ["artifact-child"],
        },
        2,
      ),
    ]);

    expect(projection.entities.subagents["agent-a"]).toBe("completed");
    expect(projection.subagentDetails["agent-a"]).toMatchObject({
      id: "agent-a",
      phase: "completed",
      parentTaskId: "task-parent",
      parentWorkerId: "worker-parent",
      workerId: "worker-child",
      role: "implementer",
      lane: "delegated",
      requestedLane: "delegated",
      traceId: "trace-1",
      scope: {
        capabilities: [
          { kind: "tool", name: "repo.read" },
          { kind: "skill", name: "research" },
          { kind: "mcp", name: "filesystem" },
        ],
        toolNames: ["repo.read"],
        skillNames: ["research"],
        mcpServers: ["filesystem"],
      },
      contract: {
        taskPreview: "Inspect repo",
        role: "implementer",
        requestedLane: "delegated",
        modelPreference: "openai:gpt-5.4",
        runtimePolicy: { maxTurns: 8 },
        policyCeiling: { network: "restricted" },
        inputArtifactRefs: ["artifact-source"],
        outputSchema: { type: "object" },
      },
      result: {
        preview: "child output",
        artifactRefs: ["artifact-child"],
      },
    });
  });

  it("projects completion-only subagent details for replay gaps", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "subagent.completed",
        {
          subagentId: "agent-a",
          parentWorkerId: "worker-parent",
          workerId: "worker-child",
          status: "failed",
          error: "child failed",
          artifactRefs: ["artifact-child"],
        },
        1,
      ),
    ]);

    expect(projection.entities.subagents["agent-a"]).toBe("failed");
    expect(projection.subagentDetails["agent-a"]).toMatchObject({
      id: "agent-a",
      phase: "failed",
      parentWorkerId: "worker-parent",
      workerId: "worker-child",
      error: "child failed",
      result: { artifactRefs: ["artifact-child"] },
    });
  });

  it("projects research runs and compact citation summaries", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "research.started",
        {
          researchRunId: "research-1",
          questionPreview: "Compare claims",
          sourcePolicy: "verified",
          requiredSourceKinds: ["memory", "web"],
        },
        1,
      ),
      event(
        "research.plan.created",
        {
          researchRunId: "research-1",
          planId: "plan-1",
          tasks: [{ id: "task-1" }],
        },
        2,
      ),
      event(
        "research.evidence.collected",
        {
          researchRunId: "research-1",
          evidenceId: "evidence-1",
          citationIds: ["citation-1"],
          evidenceCount: 1,
          citationCount: 1,
        },
        3,
      ),
      event(
        "research.citation.added",
        {
          researchRunId: "research-1",
          citationId: "citation-1",
          sourceKind: "memory",
          title: "Memory note",
          artifactPointer: "artifact://note#L4",
          traceId: "trace-1",
        },
        4,
      ),
      event(
        "research.completed",
        {
          researchRunId: "research-1",
          evidenceCount: 1,
          citationCount: 1,
          unknowns: ["one open question"],
        },
        5,
      ),
    ]);

    expect(projection.entities.research["research-1"]).toBe("completed");
    expect(projection.latestEvents[0]?.title).toBe("Research completed");
    expect(projection.researchRuns["research-1"]).toMatchObject({
      id: "research-1",
      phase: "completed",
      question: "Compare claims",
      sourcePolicy: "verified",
      requiredSourceKinds: ["memory", "web"],
      taskCount: 1,
      evidenceCount: 1,
      citationCount: 1,
      citationIds: ["citation-1"],
      latestCitation: {
        id: "citation-1",
        sourceKind: "memory",
        title: "Memory note",
        artifactPointer: "artifact://note#L4",
        traceId: "trace-1",
      },
      unknowns: ["one open question"],
    });
  });

  it("projects artifact details while preserving compact metadata", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "artifact.created",
        {
          artifactId: "artifact-a",
          path: "artifacts/report.md",
          kind: "markdown",
          title: "Report",
          summary: "Initial report",
          metadata: { bytes: 123, source: "research", nested: { drop: true } },
        },
        1,
      ),
      event(
        "artifact.updated",
        {
          artifactId: "artifact-a",
          summary: "Updated report",
          metadata: { bytes: 456, reviewed: true },
        },
        2,
      ),
    ]);

    expect(projection.entities.artifacts["artifact-a"]).toBe("updated");
    expect(projection.artifactDetails["artifact-a"]).toMatchObject({
      id: "artifact-a",
      phase: "updated",
      path: "artifacts/report.md",
      kind: "markdown",
      title: "Report",
      summary: "Updated report",
      createdAt: "2026-06-08T00:00:01.000Z",
      updatedAt: "2026-06-08T00:00:02.000Z",
      metadata: { bytes: 456, reviewed: true },
    });
    expect(projection.artifactDetails["artifact-a"]?.metadata).not.toHaveProperty("nested");
  });

  it("projects graph topology, task deltas, and checkpoints", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "graph.normalized",
        {
          graphId: "graph-1",
          rootNodeId: "root",
          totalNodes: 3,
          completedNodes: 0,
          runningNodes: 0,
          failedNodes: 0,
          nodes: [
            { id: "root", kind: "synthesize", status: "pending", description: "Root" },
            {
              id: "research",
              kind: "subagent",
              status: "pending",
              description: "Research",
              role: "researcher",
              requestedLane: "background",
            },
            { id: "write", kind: "synthesize", status: "pending", description: "Write" },
          ],
          edges: [
            { id: "root-research", from: "root", to: "research", kind: "depends_on" },
            { id: "research-write", from: "research", to: "write", kind: "depends_on" },
          ],
        },
        1,
      ),
      event(
        "task.started",
        {
          taskId: "research",
          nodeId: "research",
          kind: "subagent",
          description: "Research",
          workerId: "worker-1",
        },
        2,
      ),
      event(
        "task.completed",
        {
          taskId: "research",
          nodeId: "research",
          kind: "subagent",
          description: "Research",
        },
        3,
      ),
      event("checkpoint.saved", { checkpointId: "checkpoint-1", checkpointSeq: 3 }, 4),
      event("graph.normalized", { superstepBoundary: true }, 5),
    ]);

    expect(projection.graph).toMatchObject({
      graphId: "graph-1",
      rootNodeId: "root",
      nodeCount: 3,
      completedNodeCount: 1,
      runningNodeCount: 0,
      failedNodeCount: 0,
      edgeCount: 2,
      superstepCount: 1,
      lastCheckpointId: "checkpoint-1",
      lastCheckpointSeq: 3,
    });
    expect(projection.graph.nodes.research).toMatchObject({
      id: "research",
      phase: "completed",
      kind: "subagent",
      description: "Research",
      role: "researcher",
      requestedLane: "background",
      workerId: "worker-1",
    });
    expect(projection.entities.tasks.research).toBe("completed");
    expect(projection.graph.edges).toHaveLength(2);
    expect(projection.latestEvents[0]?.title).toBe("Graph normalized");
  });
});
