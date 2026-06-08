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
  | "research.started"
  | "research.updated"
  | "research.completed"
  | "research.failed"
  | "research.citation.added"
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

export interface SubagentScopeVm {
  capabilities?: Array<Record<string, unknown>>;
  toolNames?: string[];
  skillNames?: string[];
  mcpServers?: string[];
}

export interface SubagentContractVm {
  taskPreview?: string;
  modelPreference?: string;
  runtimePolicy?: Record<string, unknown>;
  policyCeiling?: Record<string, unknown>;
  inputArtifactRefs?: string[];
  outputSchema?: Record<string, unknown>;
}

export interface SubagentResultVm {
  preview?: string;
  artifactRefs?: string[];
}

export interface SubagentVm {
  id: string;
  role: string;
  taskId?: string;
  parentWorkerId?: string;
  workerId?: string;
  lane?: string;
  traceId?: string;
  scope?: SubagentScopeVm;
  contract?: SubagentContractVm;
  result?: SubagentResultVm;
  model?: string;
  status: "running" | "idle" | "completed" | "failed" | "stopped";
  contextUsage?: number;
  error?: string;
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

export interface ResearchCitationVm {
  id: string;
  sourceKind?: string;
  title?: string;
  uri?: string;
  artifactPointer?: string;
  score?: number;
}

export interface ResearchRunVm {
  id: string;
  status: "running" | "planned" | "completed" | "failed";
  question?: string;
  sourcePolicy?: string;
  sourceKinds?: string[];
  evidenceCount: number;
  citationCount: number;
  unknownCount: number;
  toolCalls?: number;
  latestCitation?: ResearchCitationVm;
  updatedAt: string;
}

export interface RuntimeStoreState {
  runId: string;
  events: RuntimeEvent[];
  tasks: TaskVm[];
  subagents: SubagentVm[];
  tools: ToolCallVm[];
  memoryHits: MemoryHitVm[];
  researchRuns: ResearchRunVm[];
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
  researchRuns: [],
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
