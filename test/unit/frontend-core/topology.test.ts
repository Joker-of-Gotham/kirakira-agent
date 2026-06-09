import { describe, expect, it } from "vitest";
import type { RunEvent, RuntimeOrchestrationManifest } from "../../../packages/runtime-contracts/src/index.js";
import {
  createEmptyRunDashboard,
  createSubagentTopologyView,
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

const manifest: RuntimeOrchestrationManifest = {
  profileName: "workbench-host",
  handoffMode: "swarm",
  defaultRole: "planner",
  lanes: {
    foreground: { capacity: 1 },
    delegated: { capacity: 4 },
  },
  roles: [
    {
      id: "planner",
      description: "Owns plan synthesis",
      lane: "foreground",
      model: "runtime-default",
      context: "inherit",
      toolScope: ["repo.read"],
      permissionLabels: ["workspace-read"],
    },
    {
      id: "researcher",
      description: "Collects source-backed evidence",
      lane: "delegated",
      skillScope: ["deep-research"],
      mcpServers: ["docs"],
    },
  ],
  handoffs: [
    { from: "planner", to: "researcher", mode: "swarm", approvalRequired: false },
  ],
};

describe("frontend-core subagent topology view", () => {
  it("keeps manifest roles visible before runtime workers exist", () => {
    const topology = createSubagentTopologyView(createEmptyRunDashboard("run-1"), manifest);

    expect(topology.summary).toMatchObject({
      hasManifest: true,
      profileName: "workbench-host",
      roleCount: 2,
      manifestRoleCount: 2,
      workerCount: 0,
      handoffCount: 1,
    });
    expect(topology.lanes.map((lane) => [lane.id, lane.capacity])).toEqual([
      ["foreground", 1],
      ["delegated", 4],
    ]);
    expect(topology.roles[0]).toMatchObject({
      id: "planner",
      laneId: "foreground",
      sources: ["manifest"],
      handoffTargets: ["researcher"],
      capabilityLabels: ["policy:workspace-read", "tool:repo.read"],
    });
  });

  it("merges graph plans and runtime workers into role lanes", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "graph.normalized",
        {
          nodes: [
            {
              id: "research-task",
              kind: "subagent",
              status: "pending",
              role: "researcher",
              requestedLane: "delegated",
              description: "Collect source-backed evidence",
            },
          ],
        },
        1,
      ),
      event(
        "subagent.spawned",
        {
          subagentId: "agent-research-1",
          role: "researcher",
          lane: "foreground",
          requestedLane: "delegated",
          taskPreview: "Collect source-backed evidence",
          capabilities: [
            { kind: "skill", name: "deep-research" },
            { kind: "mcp", name: "docs" },
          ],
        },
        2,
      ),
    ]);

    const topology = createSubagentTopologyView(projection, manifest);
    const researcher = topology.roles.find((role) => role.id === "researcher");

    expect(researcher).toMatchObject({
      laneId: "delegated",
      phase: "running",
      sources: ["graph", "manifest", "runtime"],
      plannedTaskCount: 1,
      workerCount: 1,
      activeWorkerCount: 1,
      mismatchCount: 1,
    });
    expect(researcher?.workers[0]).toMatchObject({
      id: "agent-research-1",
      lane: "foreground",
      requestedLane: "delegated",
      taskPreview: "Collect source-backed evidence",
      capabilityLabels: ["mcp:docs", "skill:deep-research"],
    });
    expect(topology.summary).toMatchObject({
      plannedTaskCount: 1,
      workerCount: 1,
      activeWorkerCount: 1,
      mismatchCount: 1,
    });
  });

  it("surfaces lane mismatches when no manifest role overrides runtime lanes", () => {
    const projection = projectRunDashboard(createEmptyRunDashboard(), [
      event(
        "subagent.spawned",
        {
          subagentId: "agent-a",
          role: "implementer",
          lane: "background",
          requestedLane: "delegated",
        },
        1,
      ),
    ]);

    const topology = createSubagentTopologyView(projection, {
      roles: [{ id: "implementer" }],
    });

    expect(topology.roles[0]).toMatchObject({
      id: "implementer",
      laneId: "background",
      mismatchCount: 1,
    });
    expect(topology.summary.mismatchCount).toBe(1);
  });
});
