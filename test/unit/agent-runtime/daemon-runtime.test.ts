import { describe, expect, it } from "vitest";
import type { RunEvent } from "../../../packages/event-store/src/index.js";
import { AgentRuntime } from "../../../packages/agent-runtime/src/daemon-runtime.js";

describe("AgentRuntime daemon lifecycle events", () => {
  it("emits generic task lifecycle events for worker registration", async () => {
    const events: RunEvent[] = [];
    const runtime = new AgentRuntime((event) => events.push(event));

    runtime.registerWorker({
      id: "worker-1",
      runId: "run-1",
      workloadType: "supervisor",
      status: "running",
      turnCount: 0,
      model: "test-model",
    });
    runtime.updateWorker("worker-1", { turnCount: 1 });
    await runtime.terminateWorker("worker-1");

    expect(events.map((event) => event.kind)).toEqual([
      "task.started",
      "task.started",
      "task.completed",
    ]);
    expect(events[0]?.payload).toMatchObject({
      taskId: "worker-1",
      workerId: "worker-1",
      workloadType: "supervisor",
    });
    expect(events.some((event) => event.kind === "subagent.spawned")).toBe(false);
  });
});
