import { useCallback, useReducer } from "react";

import type {
  MemoryHitVm,
  ResearchRunVm,
  RuntimeEvent,
  RuntimeStoreState,
  SubagentVm,
  TaskVm,
  ToolCallVm,
} from "../runtime-events.js";
import {
  initialRuntimeStoreState,
  nextEventId,
  nowIso,
} from "../runtime-events.js";

type RuntimeAction =
  | { type: "emit"; event: RuntimeEvent }
  | { type: "hydrate"; state: RuntimeStoreState }
  | { type: "reset"; runId?: string };

function upsertTask(tasks: TaskVm[], next: TaskVm): TaskVm[] {
  const idx = tasks.findIndex((t) => t.id === next.id);
  if (idx === -1) return [next, ...tasks].slice(0, 120);
  const copy = [...tasks];
  copy[idx] = next;
  return copy;
}

function upsertSubagent(subagents: SubagentVm[], next: SubagentVm): SubagentVm[] {
  const idx = subagents.findIndex((s) => s.id === next.id);
  if (idx === -1) return [next, ...subagents].slice(0, 120);
  const copy = [...subagents];
  copy[idx] = next;
  return copy;
}

function upsertTool(tools: ToolCallVm[], next: ToolCallVm): ToolCallVm[] {
  const idx = tools.findIndex((t) => t.id === next.id);
  if (idx === -1) return [next, ...tools].slice(0, 180);
  const copy = [...tools];
  copy[idx] = next;
  return copy;
}

function upsertMemory(hits: MemoryHitVm[], next: MemoryHitVm): MemoryHitVm[] {
  const idx = hits.findIndex((h) => h.id === next.id);
  if (idx === -1) return [next, ...hits].slice(0, 60);
  const copy = [...hits];
  copy[idx] = next;
  return copy;
}

function upsertResearch(runs: ResearchRunVm[], next: ResearchRunVm): ResearchRunVm[] {
  const idx = runs.findIndex((run) => run.id === next.id);
  if (idx === -1) return [next, ...runs].slice(0, 80);
  const copy = [...runs];
  copy[idx] = next;
  return copy;
}

function cloneStructured<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function reducer(state: RuntimeStoreState, action: RuntimeAction): RuntimeStoreState {
  if (action.type === "reset") {
    const next = initialRuntimeStoreState();
    if (action.runId) next.runId = action.runId;
    return next;
  }
  if (action.type === "hydrate") {
    return action.state;
  }

  const event = action.event;
  const events = [event, ...state.events].slice(0, 500);
  const ts = event.ts;

  switch (event.type) {
    case "task.created":
    case "task.updated": {
      const payload = event.payload as Partial<TaskVm> & {
        id: string;
        title: string;
        status: TaskVm["status"];
      };
      const prev = state.tasks.find((t) => t.id === payload.id);
      const task: TaskVm = {
        id: payload.id,
        title: payload.title,
        status: payload.status,
        subagentId: payload.subagentId ?? prev?.subagentId,
        progress: payload.progress ?? prev?.progress,
        updatedAt: ts,
      };
      return {
        ...state,
        events,
        tasks: upsertTask(state.tasks, task),
      };
    }

    case "subagent.created":
    case "subagent.updated": {
      const payload = event.payload as Partial<SubagentVm> & {
        id: string;
        role: string;
        status: SubagentVm["status"];
      };
      const prev = state.subagents.find((s) => s.id === payload.id);
      const subagent: SubagentVm = {
        id: payload.id,
        role: payload.role,
        status: payload.status,
        model: payload.model ?? prev?.model,
        taskId: payload.taskId ?? prev?.taskId,
        parentWorkerId: payload.parentWorkerId ?? prev?.parentWorkerId,
        workerId: payload.workerId ?? prev?.workerId,
        lane: payload.lane ?? prev?.lane,
        traceId: payload.traceId ?? prev?.traceId,
        scope: cloneStructured(payload.scope ?? prev?.scope),
        contract: cloneStructured(payload.contract ?? prev?.contract),
        result: cloneStructured(payload.result ?? prev?.result),
        contextUsage: payload.contextUsage ?? prev?.contextUsage,
        error: payload.error ?? prev?.error,
        updatedAt: ts,
      };
      return {
        ...state,
        events,
        subagents: upsertSubagent(state.subagents, subagent),
      };
    }

    case "tool.call.started":
    case "tool.call.completed":
    case "tool.call.failed": {
      const payload = event.payload as Partial<ToolCallVm> & {
        id: string;
        name: string;
        status: ToolCallVm["status"];
      };
      const prev = state.tools.find((t) => t.id === payload.id);
      const tool: ToolCallVm = {
        id: payload.id,
        name: payload.name,
        status: payload.status,
        latencyMs: payload.latencyMs ?? prev?.latencyMs,
        summary: payload.summary ?? prev?.summary,
        updatedAt: ts,
      };
      return {
        ...state,
        events,
        tools: upsertTool(state.tools, tool),
      };
    }

    case "memory.recalled": {
      const payload = event.payload as {
        id: string;
        query: string;
        topItems?: string[];
        count?: number;
      };
      const hit: MemoryHitVm = {
        id: payload.id,
        query: payload.query,
        topItems: payload.topItems ?? [],
        count: payload.count ?? payload.topItems?.length ?? 0,
        updatedAt: ts,
      };
      return {
        ...state,
        events,
        memoryHits: upsertMemory(state.memoryHits, hit),
      };
    }

    case "research.started":
    case "research.updated":
    case "research.completed":
    case "research.failed":
    case "research.citation.added": {
      const payload = event.payload as Partial<ResearchRunVm> & {
        id?: string;
        researchRunId?: string;
      };
      const id = payload.researchRunId ?? payload.id;
      if (!id) return { ...state, events };
      const prev = state.researchRuns.find((run) => run.id === id);
      const status =
        event.type === "research.completed" ? "completed" :
          event.type === "research.failed" ? "failed" :
            payload.status ?? prev?.status ?? "running";
      const run: ResearchRunVm = {
        id,
        status,
        question: payload.question ?? prev?.question,
        sourcePolicy: payload.sourcePolicy ?? prev?.sourcePolicy,
        sourceKinds: payload.sourceKinds ?? prev?.sourceKinds,
        evidenceCount: payload.evidenceCount ?? prev?.evidenceCount ?? 0,
        citationCount:
          payload.citationCount ??
          ((prev?.citationCount ?? 0) + (event.type === "research.citation.added" ? 1 : 0)),
        unknownCount: payload.unknownCount ?? prev?.unknownCount ?? 0,
        toolCalls: payload.toolCalls ?? prev?.toolCalls,
        latestCitation: cloneStructured(payload.latestCitation ?? prev?.latestCitation),
        updatedAt: ts,
      };
      return {
        ...state,
        events,
        researchRuns: upsertResearch(state.researchRuns, run),
      };
    }

    case "approval.created":
      return {
        ...state,
        events,
        pendingApprovals: state.pendingApprovals + 1,
      };

    case "approval.resolved":
      return {
        ...state,
        events,
        pendingApprovals: Math.max(0, state.pendingApprovals - 1),
      };

    case "trace.span.started":
      return {
        ...state,
        events,
        traceSpansOpen: state.traceSpansOpen + 1,
      };

    case "trace.span.completed":
      return {
        ...state,
        events,
        traceSpansOpen: Math.max(0, state.traceSpansOpen - 1),
      };

    default:
      return { ...state, events };
  }
}

interface EmitOptions {
  runId?: string;
}

type EmitFn = (
  type: RuntimeEvent["type"],
  payload: Record<string, unknown>,
  options?: EmitOptions,
) => RuntimeEvent<Record<string, unknown>>;

export function useRuntimeStore(): {
  state: RuntimeStoreState;
  emit: EmitFn;
  reset: (runId?: string) => void;
  hydrate: (state: RuntimeStoreState) => void;
} {
  const [state, dispatch] = useReducer(reducer, undefined, initialRuntimeStoreState);

  const emit = useCallback<EmitFn>(
    (type, payload, options) => {
      const event: RuntimeEvent = {
        type,
        payload,
        eventId: nextEventId(),
        ts: nowIso(),
        runId: options?.runId ?? state.runId,
      };
      dispatch({ type: "emit", event });
      return event;
    },
    [state.runId],
  );

  const reset = useCallback((runId?: string): void => {
    dispatch({ type: "reset", runId });
  }, []);

  const hydrate = useCallback((nextState: RuntimeStoreState): void => {
    dispatch({
      type: "hydrate",
      state: {
        ...nextState,
        events: nextState.events.map((e) => ({ ...e })),
        tasks: nextState.tasks.map((t) => ({ ...t })),
        subagents: nextState.subagents.map((s) => ({
          ...s,
          scope: cloneStructured(s.scope),
          contract: cloneStructured(s.contract),
          result: cloneStructured(s.result),
        })),
        tools: nextState.tools.map((t) => ({ ...t })),
        memoryHits: nextState.memoryHits.map((m) => ({ ...m })),
        researchRuns: nextState.researchRuns.map((run) => ({
          ...run,
          sourceKinds: run.sourceKinds ? [...run.sourceKinds] : undefined,
          latestCitation: cloneStructured(run.latestCitation),
        })),
      },
    });
  }, []);

  return { state, emit, reset, hydrate };
}
