import { describe, expect, it } from "vitest";
import type { Checkpoint, RunEvent, RunState } from "../../../packages/event-store/src/index.js";
import {
  replayFromCheckpoint,
  RunStateProjector,
} from "../../../packages/event-store/src/index.js";
import type { EventReader } from "../../../packages/event-store/src/event-reader.js";

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

describe("RunStateProjector research events", () => {
  it("projects deep research plan, progress, evidence, citations, and completion", () => {
    const state = new RunStateProjector().project([
      event(
        "research.started",
        {
          researchRunId: "research-1",
          questionPreview: "Compare source-backed claims",
          sourcePolicy: "hybrid",
          requiredSourceKinds: ["memory", "web"],
          traceId: "trace-1",
        },
        1,
      ),
      event(
        "research.plan.created",
        {
          researchRunId: "research-1",
          planId: "plan-1",
          tasks: [
            {
              id: "task-1",
              question: "Check workspace evidence",
              depth: 1,
              sourceKinds: ["memory"],
            },
          ],
        },
        2,
      ),
      event(
        "research.task.started",
        {
          researchRunId: "research-1",
          researchTaskId: "task-1",
          sourceKinds: ["memory"],
        },
        3,
      ),
      event(
        "research.source.completed",
        {
          researchRunId: "research-1",
          researchTaskId: "task-1",
          sourceKind: "memory",
          evidenceCount: 2,
          citationCount: 1,
        },
        4,
      ),
      event(
        "research.evidence.collected",
        {
          researchRunId: "research-1",
          researchTaskId: "task-1",
          evidenceIds: ["evidence-1", "evidence-2"],
          sourceKind: "memory",
          citationIds: ["citation-1"],
          summary: "bounded summary",
        },
        5,
      ),
      event(
        "research.citation.added",
        {
          researchRunId: "research-1",
          citationId: "citation-1",
          sourceKind: "memory",
          traceId: "trace-1",
          sourceRecordId: "rec-1",
          artifactPointer: "artifact://note#L4",
          score: 0.91,
        },
        6,
      ),
      event(
        "research.task.completed",
        {
          researchRunId: "research-1",
          researchTaskId: "task-1",
          evidenceCount: 2,
          citationCount: 1,
        },
        7,
      ),
      event(
        "research.completed",
        {
          researchRunId: "research-1",
          planId: "plan-1",
          toolCalls: 1,
          evidenceCount: 2,
          citationCount: 1,
          unknowns: ["one open question"],
        },
        8,
      ),
    ]);

    expect(state.researchRuns["research-1"]).toMatchObject({
      id: "research-1",
      status: "completed",
      question: "Compare source-backed claims",
      planId: "plan-1",
      sourcePolicy: "hybrid",
      requiredSourceKinds: ["memory", "web"],
      traceId: "trace-1",
      toolCalls: 1,
      unknowns: ["one open question"],
      tasks: {
          "task-1": {
            id: "task-1",
            status: "completed",
            evidenceCount: 2,
            citationCount: 1,
          },
        },
        evidence: {
          "evidence-1": {
            sourceKind: "memory",
            citationIds: ["citation-1"],
          },
          "evidence-2": {
            sourceKind: "memory",
            citationIds: ["citation-1"],
          },
        },
      citations: {
        "citation-1": {
          sourceKind: "memory",
          traceId: "trace-1",
          sourceRecordId: "rec-1",
          artifactPointer: "artifact://note#L4",
          score: 0.91,
        },
      },
    });
  });

  it("materializes a research run from a citation event without a prior plan", () => {
    const state = new RunStateProjector().project([
      event(
        "research.citation.added",
        {
          researchRunId: "research-late",
          citationId: "citation-late",
          sourceKind: "web",
          uri: "https://example.test/source",
        },
        1,
      ),
    ]);

    expect(state.researchRuns["research-late"]).toMatchObject({
      id: "research-late",
      status: "running",
      citations: {
        "citation-late": {
          uri: "https://example.test/source",
        },
      },
    });
  });

  it("normalizes old checkpoint state before replaying research tail events", () => {
    const oldState = {
      runId: "run-1",
      status: "running",
      taskNodes: {},
      taskEdges: [],
      artifacts: {},
      subagents: {},
      skills: {},
      tools: {},
      modelTranscript: [],
      sandboxOpen: false,
      approvals: {},
      interrupts: {},
      merges: {},
      control: { drainRequestedVersion: 0 },
      checkpoint: {},
      lastSeq: 1,
    } as unknown as RunState;
    const checkpoint: Checkpoint = {
      id: "checkpoint-1",
      runId: "run-1",
      seq: 1,
      timestamp: "2026-06-08T00:00:01.000Z",
      state: oldState,
      eventIdUpTo: "evt-1",
    };
    const reader = {
      readSinceCheckpoint() {
        return [
          event(
            "research.citation.added",
            { researchRunId: "research-1", citationId: "citation-1" },
            2,
          ),
        ];
      },
    } as unknown as EventReader;

    const state = replayFromCheckpoint("run-1", checkpoint, reader);

    expect(state.researchRuns["research-1"]?.citations["citation-1"]).toMatchObject({
      id: "citation-1",
    });
  });
});
