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
