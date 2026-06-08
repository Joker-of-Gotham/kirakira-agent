import type {
  RuntimeTransport,
  RuntimeTransportEvent,
  SubmitPromptRequest,
  SubscribeRunOptions,
  Unsubscribe,
} from "@kirakira/frontend-core";
import type { RunEvent, RunEventKind } from "@kirakira/runtime-contracts";

type Listener = (event: RuntimeTransportEvent) => void;

const now = () => new Date().toISOString();

export function createMockRuntimeTransport(): RuntimeTransport {
  let counter = 0;
  let connected = false;
  const eventsByRun = new Map<string, RunEvent[]>();
  const listenersByRun = new Map<string, Set<Listener>>();
  const timers = new Set<number>();

  const makeEvent = (
    runId: string,
    kind: RunEventKind,
    payload: Record<string, unknown> = {},
  ): RunEvent => {
    counter += 1;
    return {
      id: `mock-event-${counter}`,
      runId,
      timestamp: now(),
      kind,
      payload,
      checkpointSeq: counter,
    };
  };

  const emit = (event: RunEvent) => {
    const list = eventsByRun.get(event.runId) ?? [];
    list.push(event);
    eventsByRun.set(event.runId, list);
    const listeners = listenersByRun.get(event.runId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener({ type: "event", event });
    }
  };

  const schedule = (delay: number, fn: () => void) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      fn();
    }, delay);
    timers.add(timer);
  };

  const replay = (
    runId: string,
    listener: Listener,
    options?: SubscribeRunOptions,
  ) => {
    const events = eventsByRun.get(runId) ?? [];
    for (const event of events) {
      if (options?.filter?.kinds && !options.filter.kinds.includes(event.kind)) continue;
      if (options?.afterSeq !== undefined && (event.checkpointSeq ?? 0) <= options.afterSeq) {
        continue;
      }
      listener({ type: "event", event });
    }
  };

  const startMockRun = (request: SubmitPromptRequest, runId: string) => {
    const mode = request.mode ?? "interactive";
    const prompt = request.prompt.trim();
    const researchRunId = `${runId}-research`;
    const subagentId = `${runId}-agent`;
    const callId = `${runId}-tool`;
    const ticketId = `${runId}-approval`;

    const timeline: Array<[number, RunEventKind, Record<string, unknown>]> = [
      [0, "run.created", { prompt, mode }],
      [120, "run.started", { prompt, mode }],
      [
        240,
        "graph.normalized",
        { totalNodes: 4, completedNodes: 1, runningNodes: 2, failedNodes: 0 },
      ],
      [
        420,
        "subagent.spawned",
        {
          subagentId,
          parentTaskId: "workspace-scan",
          lane: "research",
          taskPreview: "Map runtime contracts and UI surface gaps",
          capabilities: [
            { kind: "tool", name: "repo.read" },
            { kind: "skill", name: "frontend-ui-engineering" },
          ],
          modelPreference: "runtime-default",
          traceId: `${runId}-trace`,
        },
      ],
      [
        640,
        "research.started",
        {
          researchRunId,
          question: prompt,
          sourcePolicy: "authoritative-first",
          requiredSourceKinds: ["docs", "repo"],
          subagentId,
          traceId: `${runId}-trace`,
        },
      ],
      [
        860,
        "tool.call.started",
        { callId, toolId: "docs.search", summary: "Checking runtime and UI source boundaries" },
      ],
      [
        1180,
        "research.citation.added",
        {
          researchRunId,
          citationId: `${researchRunId}-citation`,
          sourceKind: "docs",
          title: "Electron context isolation",
          uri: "https://www.electronjs.org/docs/latest/tutorial/context-isolation",
        },
      ],
      [
        1460,
        "tool.call.completed",
        { callId, summary: "Boundary checks completed" },
      ],
      [
        1760,
        "approval.requested",
        {
          ticketId,
          action: "Apply workspace-safe runtime changes",
          reason: "Desktop main process needs to own daemon access before renderer wiring",
        },
      ],
      [
        2120,
        "research.completed",
        {
          researchRunId,
          evidenceCount: 3,
          citationCount: 1,
          unknowns: [],
        },
      ],
      [
        2460,
        "subagent.completed",
        {
          subagentId,
          status: "completed",
          preview: "Contracts are ready for browser and desktop adapters",
          artifactRefs: ["runtime-contracts"],
        },
      ],
    ];

    for (const [delay, kind, payload] of timeline) {
      schedule(delay, () => emit(makeEvent(runId, kind, payload)));
    }
  };

  return {
    mode: "mock",
    async connect() {
      connected = true;
    },
    disconnect() {
      connected = false;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      listenersByRun.clear();
    },
    async submitPrompt(request) {
      if (!connected) {
        throw new Error("Mock runtime is not connected");
      }
      const runId = `run-${Date.now().toString(36)}-${counter + 1}`;
      eventsByRun.set(runId, []);
      startMockRun(request, runId);
      return { runId };
    },
    async getState(runId) {
      return {
        runId,
        state: {
          eventCount: eventsByRun.get(runId)?.length ?? 0,
        },
      };
    },
    subscribeRun(runId, onEvent, options): Unsubscribe {
      const listeners = listenersByRun.get(runId) ?? new Set<Listener>();
      listeners.add(onEvent);
      listenersByRun.set(runId, listeners);
      replay(runId, onEvent, options);
      return () => {
        listeners.delete(onEvent);
        if (listeners.size === 0) listenersByRun.delete(runId);
      };
    },
    async approve(decision) {
      emit(
        makeEvent(decision.runId, "approval.resolved", {
          ticketId: decision.ticketId,
          decision: decision.decision,
          reason: decision.reason,
        }),
      );
      emit(
        makeEvent(decision.runId, "run.completed", {
          summary: "Run completed after approval",
        }),
      );
    },
    async cancel(runId, reason) {
      emit(makeEvent(runId, "run.failed", { error: reason ?? "Cancelled" }));
    },
    async drain() {
      for (const runId of eventsByRun.keys()) {
        emit(makeEvent(runId, "run.drained", { summary: "Runtime drained" }));
      }
    },
  };
}
