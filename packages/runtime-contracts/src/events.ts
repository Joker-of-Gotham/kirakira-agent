export const RUN_EVENT_KINDS = [
  "run.created",
  "run.started",
  "run.completed",
  "run.failed",
  "run.drained",
  "plan.compiled",
  "graph.normalized",
  "task.ready",
  "task.started",
  "task.completed",
  "task.failed",
  "subagent.spawned",
  "subagent.completed",
  "research.started",
  "research.plan.created",
  "research.task.started",
  "research.task.completed",
  "research.task.failed",
  "research.source.started",
  "research.source.completed",
  "research.source.failed",
  "research.evidence.collected",
  "research.citation.added",
  "research.limit.reached",
  "research.completed",
  "research.failed",
  "tool.search.requested",
  "tool.selected",
  "tool.call.started",
  "tool.call.completed",
  "tool.call.failed",
  "skill.advertised",
  "skill.loaded",
  "skill.materialized",
  "model.request",
  "model.response",
  "sandbox.opened",
  "sandbox.closed",
  "artifact.created",
  "artifact.updated",
  "approval.requested",
  "approval.resolved",
  "interrupt.raised",
  "interrupt.resumed",
  "checkpoint.saved",
  "checkpoint.restored",
  "merge.proposed",
  "merge.applied",
  "steer.received",
  "drain.requested",
] as const;

export type RunEventKind = (typeof RUN_EVENT_KINDS)[number];

export interface RunEvent {
  id: string;
  runId: string;
  parentRunId?: string;
  timestamp: string;
  kind: RunEventKind;
  payload: Record<string, unknown>;
  checkpointSeq?: number;
}

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "drained";

export type TaskNodeStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed";

export interface TaskNode {
  id: string;
  status: TaskNodeStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface TaskEdge {
  id: string;
  from: string;
  to: string;
  status?: "pending" | "active" | "completed";
}

export interface ArtifactRecord {
  id: string;
  path?: string;
  kind?: string;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface SubagentScopeRecord {
  capabilities?: Array<Record<string, unknown>>;
  toolNames?: string[];
  skillNames?: string[];
  mcpServers?: string[];
}

export interface SubagentContractRecord {
  taskPreview?: string;
  role?: string;
  requestedLane?: string;
  modelPreference?: string;
  runtimePolicy?: Record<string, unknown>;
  policyCeiling?: Record<string, unknown>;
  inputArtifactRefs?: string[];
  outputSchema?: Record<string, unknown>;
}

export interface SubagentResultRecord {
  preview?: string;
  artifactRefs?: string[];
}

export interface SubagentRecord {
  id: string;
  parentTaskId?: string;
  parentWorkerId?: string;
  workerId?: string;
  role?: string;
  lane?: string;
  requestedLane?: string;
  traceId?: string;
  scope?: SubagentScopeRecord;
  contract?: SubagentContractRecord;
  result?: SubagentResultRecord;
  status: "spawned" | "completed" | "failed";
  spawnedAt: string;
  completedAt?: string;
  error?: string;
}

export type ResearchRunStatus = "planned" | "running" | "completed" | "failed";
export type ResearchTaskStatus = "pending" | "running" | "completed" | "failed";

export interface ResearchTaskRecord {
  id: string;
  status: ResearchTaskStatus;
  question?: string;
  depth?: number;
  sourceKinds?: string[];
  startedAt?: string;
  completedAt?: string;
  evidenceCount?: number;
  citationCount?: number;
  error?: string;
}

export interface ResearchEvidenceRecord {
  id: string;
  taskId?: string;
  sourceKind?: string;
  query?: string;
  title?: string;
  summary?: string;
  citationIds?: string[];
  collectedAt: string;
  metadata?: Record<string, unknown>;
}

export interface ResearchCitationRecord {
  id: string;
  sourceKind?: string;
  title?: string;
  uri?: string;
  summary?: string;
  traceId?: string;
  queryId?: string;
  sourceRecordId?: string;
  evidenceIds?: string[];
  provenanceIds?: string[];
  artifactPointer?: string;
  routeNames?: string[];
  score?: number;
  metadata?: Record<string, unknown>;
  addedAt: string;
}

export interface ResearchRunRecord {
  id: string;
  status: ResearchRunStatus;
  question?: string;
  planId?: string;
  sourcePolicy?: string;
  requiredSourceKinds?: string[];
  traceId?: string;
  parentTaskId?: string;
  parentWorkerId?: string;
  subagentId?: string;
  limits?: Record<string, unknown>;
  citationSchema?: Record<string, unknown>;
  tasks: Record<string, ResearchTaskRecord>;
  evidence: Record<string, ResearchEvidenceRecord>;
  citations: Record<string, ResearchCitationRecord>;
  unknowns?: string[];
  toolCalls?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  state: "advertised" | "loaded" | "materialized";
  at: string;
}

export interface ToolInvocationRecord {
  callId: string;
  toolId?: string;
  phase:
    | "search"
    | "selected"
    | "started"
    | "completed"
    | "failed";
  at: string;
  detail?: Record<string, unknown>;
}

export interface ApprovalRecord {
  id: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
  resolvedAt?: string;
  decision?: Record<string, unknown>;
}

export interface InterruptRecord {
  id: string;
  status: "raised" | "resumed";
  at: string;
  reason?: string;
}

export interface MergeRecord {
  id: string;
  status: "proposed" | "applied";
  at: string;
  detail?: Record<string, unknown>;
}

export interface RunStateCheckpointInfo {
  lastCheckpointId?: string;
  lastCheckpointSeq?: number;
  lastEventId?: string;
  lastEventSeq?: number;
}

export interface RunState {
  runId: string;
  parentRunId?: string;
  status: RunStatus;
  workspaceRoot?: string;
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
  errorMessage?: string;
  plan?: Record<string, unknown>;
  normalizedGraph?: Record<string, unknown>;
  taskNodes: Record<string, TaskNode>;
  taskEdges: TaskEdge[];
  artifacts: Record<string, ArtifactRecord>;
  subagents: Record<string, SubagentRecord>;
  researchRuns: Record<string, ResearchRunRecord>;
  skills: Record<string, SkillRecord>;
  tools: Record<string, ToolInvocationRecord>;
  modelTranscript: Array<{
    kind: "request" | "response";
    at: string;
    body: Record<string, unknown>;
  }>;
  sandboxOpen: boolean;
  approvals: Record<string, ApprovalRecord>;
  interrupts: Record<string, InterruptRecord>;
  merges: Record<string, MergeRecord>;
  control: {
    lastSteer?: Record<string, unknown>;
    drainRequestedVersion: number;
    lastDrainRequestedAt?: string;
  };
  checkpoint: RunStateCheckpointInfo;
  lastSeq: number;
}

export interface Checkpoint {
  id: string;
  runId: string;
  seq: number;
  timestamp: string;
  state: RunState;
  eventIdUpTo: string;
}

export interface EventFilter {
  runId?: string;
  kinds?: RunEventKind[];
  after?: string;
  before?: string;
  limit?: number;
}

export function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null) {
    return "null";
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return JSON.stringify(value);
  }
  if (t !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort().filter((k) => obj[k] !== undefined);
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}
