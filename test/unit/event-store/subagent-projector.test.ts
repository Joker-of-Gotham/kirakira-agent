import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/event-store/src/index.js";
import { RunStateProjector } from "../../../packages/event-store/src/index.js";

const event = (
  kind: RunEvent["kind"],
  payload: Record<string, unknown>,
  seq: number,
): RunEvent => ({
  id: `evt-${seq}`,
  runId: "run-1",
  timestamp: `2026-06-08T00:00:${String(seq).padStart(2, "0")}.000Z`,
  kind,
  payload,
  checkpointSeq: seq,
});

describe("RunStateProjector subagent events", () => {
  it("preserves subagent topology and scope metadata", () => {
    const state = new RunStateProjector().project([
      event(
        "subagent.spawned",
        {
          subagentId: "sg-1",
          parentTaskId: "task-parent",
          parentWorkerId: "worker-parent",
          role: "implementer",
          lane: "delegated",
          requestedLane: "delegated",
          traceId: "trace-1",
          taskPreview: "Inspect repo",
          capabilities: [{ kind: "tool", name: "repo.read" }],
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
          subagentId: "sg-1",
          workerId: "worker-child",
          status: "completed",
          preview: "child output",
          artifactRefs: ["artifact-child"],
        },
        2,
      ),
    ]);

    expect(state.subagents["sg-1"]).toMatchObject({
      id: "sg-1",
      parentTaskId: "task-parent",
      parentWorkerId: "worker-parent",
      workerId: "worker-child",
      role: "implementer",
      lane: "delegated",
      requestedLane: "delegated",
      traceId: "trace-1",
      scope: {
        capabilities: [{ kind: "tool", name: "repo.read" }],
        toolNames: ["repo.read"],
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
      status: "completed",
    });
  });

  it("projects completion metadata even without a prior spawned event", () => {
    const state = new RunStateProjector().project([
      event(
        "subagent.completed",
        {
          subagentId: "sg-1",
          parentTaskId: "task-parent",
          workerId: "worker-child",
          status: "completed",
          preview: "child output",
        },
        1,
      ),
    ]);

    expect(state.subagents["sg-1"]).toMatchObject({
      id: "sg-1",
      parentTaskId: "task-parent",
      workerId: "worker-child",
      status: "completed",
      result: { preview: "child output" },
      spawnedAt: "2026-06-08T00:00:01.000Z",
      completedAt: "2026-06-08T00:00:01.000Z",
    });
  });

  it("projects subagent failure as a first-class subagent state", () => {
    const state = new RunStateProjector().project([
      event("subagent.spawned", { subagentId: "sg-1" }, 1),
      event(
        "subagent.completed",
        { subagentId: "sg-1", status: "failed", error: "boom" },
        2,
      ),
    ]);

    expect(state.subagents["sg-1"]).toMatchObject({
      id: "sg-1",
      status: "failed",
      error: "boom",
    });
  });
});
