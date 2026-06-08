import { describe, expect, it } from "vitest";
import type { RunEventKind } from "../../../packages/event-store/src/index.js";
import { ResearchEventBridge } from "../../../packages/orchestrator-kernel/src/index.js";

describe("ResearchEventBridge", () => {
  it("translates neutral deep-research progress into bounded durable events", async () => {
    const emitted: Array<{ kind: RunEventKind; payload: Record<string, unknown> }> = [];
    const bridge = new ResearchEventBridge(
      {
        researchRunId: "research-1",
        nodeId: "node-1",
        question: "  This is a long research prompt that should be normalized and capped before it reaches durable events.  ",
        sourcePolicy: "hybrid",
        requiredSourceKinds: ["memory", "web"],
        requireCitations: true,
        traceId: "trace-1",
      },
      (kind, payload) => {
        emitted.push({ kind, payload });
      },
    );

    await bridge.handle({ phase: "started" });
    await bridge.handle({
      phase: "citation_added",
      planId: "plan-1",
      taskId: "task-1",
      citations: [
        {
          id: "citation-1",
          sourceKind: "memory",
          title: "Memory citation",
          summary: "A ".repeat(200),
          traceId: "trace-1",
          sourceRecordId: "rec-1",
          metadata: {
            safe: "ok",
            nested: { should: "drop" },
          },
        },
      ],
    });

    expect(emitted[0]).toMatchObject({
      kind: "research.started",
      payload: {
        researchRunId: "research-1",
        nodeId: "node-1",
        sourcePolicy: "hybrid",
        requiredSourceKinds: ["memory", "web"],
        traceId: "trace-1",
      },
    });
    expect(emitted[0]?.payload.questionHash).toEqual(expect.any(String));
    expect(emitted[0]?.payload.question).toBeUndefined();
    expect(emitted[1]).toMatchObject({
      kind: "research.citation.added",
      payload: {
        researchRunId: "research-1",
        planId: "plan-1",
        researchTaskId: "task-1",
        citationId: "citation-1",
        sourceKind: "memory",
        title: "Memory citation",
        traceId: "trace-1",
        sourceRecordId: "rec-1",
        metadata: { safe: "ok" },
      },
    });
    expect(String(emitted[1]?.payload.summary).length).toBeLessThanOrEqual(240);
  });
});
