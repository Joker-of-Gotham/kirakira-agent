export type RuntimeEventType =
  | "session.created"
  | "message.user.added"
  | "message.assistant.delta"
  | "message.assistant.completed"
  | "tool.call.started"
  | "tool.call.completed"
  | "tool.call.failed"
  | "approval.created"
  | "approval.resolved"
  | "task.created"
  | "task.updated"
  | "subagent.created"
  | "subagent.updated"
  | "memory.recalled"
  | "diff.created"
  | "trace.span.started"
  | "trace.span.completed"
  | "error.raised";

export interface RuntimeEvent<T = Record<string, unknown>> {
  type: RuntimeEventType;
  eventId: string;
  ts: string;
  runId: string;
  payload: T;
}

export interface TaskVm {
  id: string;
  title: string;
  status: "running" | "queued" | "completed" | "failed" | "cancelled";
  subagentId?: string;
  progress?: { done: number; total: number };
  updatedAt: string;
}

export interface SubagentVm {
  id: string;
  role: string;
  taskId?: string;
  model?: string;
  status: "running" | "idle" | "completed" | "failed" | "stopped";
  contextUsage?: number;
  updatedAt: string;
}

export interface ToolCallVm {
  id: string;
  name: string;
  status: "running" | "completed" | "failed";
  latencyMs?: number;
  summary?: string;
  updatedAt: string;
}

export interface MemoryHitVm {
  id: string;
  query: string;
  topItems: string[];
  count: number;
  updatedAt: string;
}

export interface RuntimeStoreState {
  runId: string;
  events: RuntimeEvent[];
  tasks: TaskVm[];
  subagents: SubagentVm[];
  tools: ToolCallVm[];
  memoryHits: MemoryHitVm[];
  pendingApprovals: number;
  traceSpansOpen: number;
}

export const initialRuntimeStoreState = (): RuntimeStoreState => ({
  runId: `run_${Date.now().toString(36)}`,
  events: [],
  tasks: [],
  subagents: [],
  tools: [],
  memoryHits: [],
  pendingApprovals: 0,
  traceSpansOpen: 0,
});

let seq = 0;
export function nextEventId(): string {
  seq += 1;
  return `evt_${Date.now().toString(36)}_${seq.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
