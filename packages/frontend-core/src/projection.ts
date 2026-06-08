import type {
  RunEvent,
  RunEventKind,
  ResearchCitationRecord,
  SubagentContractRecord,
  SubagentResultRecord,
  SubagentScopeRecord,
} from "@kirakira/runtime-contracts";

export type RunDashboardStatus =
  | "idle"
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "drained";

export type EntityPhase =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "requested"
  | "resolved"
  | "created"
  | "updated";

export interface RuntimeEventSummary {
  id: string;
  runId: string;
  kind: RunEventKind;
  timestamp: string;
  title: string;
  detail?: string;
}

export interface RunDashboardSubagent {
  id: string;
  phase: EntityPhase;
  parentTaskId?: string;
  parentWorkerId?: string;
  workerId?: string;
  lane?: string;
  traceId?: string;
  scope?: SubagentScopeRecord;
  contract?: SubagentContractRecord;
  result?: SubagentResultRecord;
  error?: string;
  updatedAt: string;
}

export interface RunDashboardResearchCitation {
  id: string;
  sourceKind?: string;
  title?: string;
  uri?: string;
  traceId?: string;
  sourceRecordId?: string;
  artifactPointer?: string;
}

export interface RunDashboardResearchRun {
  id: string;
  phase: EntityPhase;
  question?: string;
  sourcePolicy?: string;
  requiredSourceKinds?: string[];
  traceId?: string;
  parentTaskId?: string;
  parentWorkerId?: string;
  subagentId?: string;
  taskCount?: number;
  evidenceCount: number;
  citationCount: number;
  citationIds: string[];
  latestCitation?: RunDashboardResearchCitation;
  unknowns?: string[];
  error?: string;
  updatedAt: string;
}

export interface RunDashboardEntityMaps {
  tasks: Record<string, EntityPhase>;
  subagents: Record<string, EntityPhase>;
  research: Record<string, EntityPhase>;
  tools: Record<string, EntityPhase>;
  approvals: Record<string, EntityPhase>;
  artifacts: Record<string, EntityPhase>;
}

export interface RunDashboardProjection {
  runId?: string;
  parentRunId?: string;
  status: RunDashboardStatus;
  createdAt?: string;
  startedAt?: string;
  endedAt?: string;
  errorMessage?: string;
  latestEvents: RuntimeEventSummary[];
  entities: RunDashboardEntityMaps;
  subagentDetails: Record<string, RunDashboardSubagent>;
  researchRuns: Record<string, RunDashboardResearchRun>;
  pendingApprovalIds: string[];
  updatedAt?: string;
}

export interface ProjectionOptions {
  latestEventLimit?: number;
}

type ProjectionHandler = (
  state: RunDashboardProjection,
  event: RunEvent,
) => RunDashboardProjection;

const DEFAULT_LATEST_EVENT_LIMIT = 50;

const STATUS_BY_EVENT: Partial<Record<RunEventKind, RunDashboardStatus>> = {
  "run.created": "pending",
  "run.started": "running",
  "run.completed": "completed",
  "run.failed": "failed",
  "run.drained": "drained",
};

const TASK_PHASE_BY_EVENT: Partial<Record<RunEventKind, EntityPhase>> = {
  "task.ready": "ready",
  "task.started": "running",
  "task.completed": "completed",
  "task.failed": "failed",
};

const SUBAGENT_PHASE_BY_EVENT: Partial<Record<RunEventKind, EntityPhase>> = {
  "subagent.spawned": "running",
  "subagent.completed": "completed",
};

const TOOL_PHASE_BY_EVENT: Partial<Record<RunEventKind, EntityPhase>> = {
  "tool.search.requested": "requested",
  "tool.selected": "ready",
  "tool.call.started": "running",
  "tool.call.completed": "completed",
  "tool.call.failed": "failed",
};

const RESEARCH_PHASE_BY_EVENT: Partial<Record<RunEventKind, EntityPhase>> = {
  "research.started": "running",
  "research.plan.created": "created",
  "research.task.started": "running",
  "research.task.completed": "running",
  "research.task.failed": "failed",
  "research.source.started": "running",
  "research.source.completed": "running",
  "research.source.failed": "running",
  "research.evidence.collected": "running",
  "research.citation.added": "running",
  "research.limit.reached": "running",
  "research.completed": "completed",
  "research.failed": "failed",
};

const APPROVAL_PHASE_BY_EVENT: Partial<Record<RunEventKind, EntityPhase>> = {
  "approval.requested": "requested",
  "approval.resolved": "resolved",
};

const ARTIFACT_PHASE_BY_EVENT: Partial<Record<RunEventKind, EntityPhase>> = {
  "artifact.created": "created",
  "artifact.updated": "updated",
};

const EVENT_TITLES: Partial<Record<RunEventKind, string>> = {
  "run.created": "Run created",
  "run.started": "Run started",
  "run.completed": "Run completed",
  "run.failed": "Run failed",
  "run.drained": "Run drained",
  "subagent.spawned": "Subagent spawned",
  "subagent.completed": "Subagent completed",
  "research.started": "Research started",
  "research.plan.created": "Research plan created",
  "research.task.started": "Research task started",
  "research.task.completed": "Research task completed",
  "research.task.failed": "Research task failed",
  "research.source.started": "Research source started",
  "research.source.completed": "Research source completed",
  "research.source.failed": "Research source failed",
  "research.evidence.collected": "Research evidence collected",
  "research.citation.added": "Research citation added",
  "research.limit.reached": "Research limit reached",
  "research.completed": "Research completed",
  "research.failed": "Research failed",
  "approval.requested": "Approval requested",
  "approval.resolved": "Approval resolved",
  "tool.call.started": "Tool call started",
  "tool.call.completed": "Tool call completed",
  "tool.call.failed": "Tool call failed",
};

const ENTITY_ID_KEYS = [
  "id",
  "taskId",
  "subagentId",
  "workerId",
  "toolCallId",
  "callId",
  "approvalId",
  "ticketId",
  "artifactId",
  "researchRunId",
  "planId",
  "evidenceId",
  "citationId",
] as const;

export function createEmptyRunDashboard(runId?: string): RunDashboardProjection {
  return {
    ...(runId !== undefined ? { runId } : {}),
    status: "idle",
    latestEvents: [],
    entities: {
      tasks: {},
      subagents: {},
      research: {},
      tools: {},
      approvals: {},
      artifacts: {},
    },
    subagentDetails: {},
    researchRuns: {},
    pendingApprovalIds: [],
  };
}

export function projectRunDashboard(
  initial: RunDashboardProjection,
  events: readonly RunEvent[],
  options: ProjectionOptions = {},
): RunDashboardProjection {
  const limit = options.latestEventLimit ?? DEFAULT_LATEST_EVENT_LIMIT;
  return events.reduce(
    (state, event) => trimLatestEvents(projectOne(state, event), limit),
    initial,
  );
}

export function summarizeRunEvent(event: RunEvent): RuntimeEventSummary {
  const detail = firstString(event.payload, [
    "summary",
    "message",
    "error",
    "toolName",
    "name",
    "reason",
  ]);
  return {
    id: event.id,
    runId: event.runId,
    kind: event.kind,
    timestamp: event.timestamp,
    title: EVENT_TITLES[event.kind] ?? event.kind,
    ...(detail !== undefined ? { detail } : {}),
  };
}

const HANDLERS: Partial<Record<RunEventKind, ProjectionHandler>> = {
  "run.created": applyRunLifecycle,
  "run.started": applyRunLifecycle,
  "run.completed": applyRunLifecycle,
  "run.failed": applyRunLifecycle,
  "run.drained": applyRunLifecycle,
  "task.ready": applyTask,
  "task.started": applyTask,
  "task.completed": applyTask,
  "task.failed": applyTask,
  "subagent.spawned": applySubagent,
  "subagent.completed": applySubagent,
  "research.started": applyResearch,
  "research.plan.created": applyResearch,
  "research.task.started": applyResearch,
  "research.task.completed": applyResearch,
  "research.task.failed": applyResearch,
  "research.source.started": applyResearch,
  "research.source.completed": applyResearch,
  "research.source.failed": applyResearch,
  "research.evidence.collected": applyResearch,
  "research.citation.added": applyResearch,
  "research.limit.reached": applyResearch,
  "research.completed": applyResearch,
  "research.failed": applyResearch,
  "tool.search.requested": applyTool,
  "tool.selected": applyTool,
  "tool.call.started": applyTool,
  "tool.call.completed": applyTool,
  "tool.call.failed": applyTool,
  "approval.requested": applyApproval,
  "approval.resolved": applyApproval,
  "artifact.created": applyArtifact,
  "artifact.updated": applyArtifact,
};

function projectOne(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  const handler = HANDLERS[event.kind] ?? applyGeneric;
  return handler(withEventSummary(state, event), event);
}

function applyRunLifecycle(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  const status = STATUS_BY_EVENT[event.kind] ?? state.status;
  const endedAt = status === "completed" || status === "failed" || status === "drained"
    ? event.timestamp
    : state.endedAt;
  return {
    ...state,
    runId: event.runId,
    parentRunId: event.parentRunId ?? state.parentRunId,
    status,
    createdAt: event.kind === "run.created" ? event.timestamp : state.createdAt,
    startedAt: event.kind === "run.started" ? event.timestamp : state.startedAt,
    ...(endedAt !== undefined ? { endedAt } : {}),
    errorMessage: event.kind === "run.failed"
      ? firstString(event.payload, ["error", "message"])
      : state.errorMessage,
    updatedAt: event.timestamp,
  };
}

function applyTask(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  return setEntityPhase(state, "tasks", event, TASK_PHASE_BY_EVENT[event.kind]);
}

function applySubagent(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  const phase =
    event.kind === "subagent.completed" && event.payload.status === "failed"
      ? "failed"
      : SUBAGENT_PHASE_BY_EVENT[event.kind];
  const next = setEntityPhase(
    state,
    "subagents",
    event,
    phase,
  );
  if (!phase) return next;
  const id = entityId(event);
  if (!id) return next;
  const previous = next.subagentDetails[id];
  return {
    ...next,
    subagentDetails: {
      ...next.subagentDetails,
      [id]: {
        ...previous,
        id,
        phase,
        ...subagentDetail(event),
        updatedAt: event.timestamp,
      },
    },
  };
}

function applyResearch(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  const phase = RESEARCH_PHASE_BY_EVENT[event.kind];
  const id = researchEntityId(event);
  const next = setEntityPhase(state, "research", event, phase, id);
  if (!phase || !id) return next;

  const previous = next.researchRuns[id];
  const citation = researchCitation(event.payload);
  const citationIds = appendUnique(
    previous?.citationIds ?? [],
    firstString(event.payload, ["citationId"]),
  );
  const evidenceIncrement = event.kind === "research.evidence.collected" ? 1 : 0;
  const citationIncrement = event.kind === "research.citation.added" ? 1 : 0;

  return {
    ...next,
    researchRuns: {
      ...next.researchRuns,
      [id]: {
        ...previous,
        id,
        phase,
        ...researchDetail(event),
        evidenceCount:
          numberValue(event.payload.evidenceCount) ??
          ((previous?.evidenceCount ?? 0) + evidenceIncrement),
        citationCount:
          numberValue(event.payload.citationCount) ??
          ((previous?.citationCount ?? 0) + citationIncrement),
        citationIds,
        ...(citation !== undefined ? { latestCitation: citation } : {}),
        updatedAt: event.timestamp,
      },
    },
  };
}

function applyTool(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  return setEntityPhase(state, "tools", event, TOOL_PHASE_BY_EVENT[event.kind]);
}

function applyApproval(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  const next = setEntityPhase(
    state,
    "approvals",
    event,
    APPROVAL_PHASE_BY_EVENT[event.kind],
  );
  const id = entityId(event);
  if (!id) return next;
  const pending = new Set(next.pendingApprovalIds);
  if (event.kind === "approval.requested") {
    pending.add(id);
  }
  if (event.kind === "approval.resolved") {
    pending.delete(id);
  }
  return { ...next, pendingApprovalIds: [...pending] };
}

function applyArtifact(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  return setEntityPhase(
    state,
    "artifacts",
    event,
    ARTIFACT_PHASE_BY_EVENT[event.kind],
  );
}

function applyGeneric(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  return {
    ...state,
    runId: state.runId ?? event.runId,
    parentRunId: event.parentRunId ?? state.parentRunId,
    updatedAt: event.timestamp,
  };
}

function withEventSummary(
  state: RunDashboardProjection,
  event: RunEvent,
): RunDashboardProjection {
  return {
    ...state,
    latestEvents: [summarizeRunEvent(event), ...state.latestEvents],
  };
}

function trimLatestEvents(
  state: RunDashboardProjection,
  limit: number,
): RunDashboardProjection {
  if (state.latestEvents.length <= limit) return state;
  return { ...state, latestEvents: state.latestEvents.slice(0, limit) };
}

function setEntityPhase(
  state: RunDashboardProjection,
  bucket: keyof RunDashboardEntityMaps,
  event: RunEvent,
  phase: EntityPhase | undefined,
  explicitId?: string,
): RunDashboardProjection {
  const id = explicitId ?? entityId(event);
  if (!id || !phase) return applyGeneric(state, event);
  return {
    ...state,
    runId: state.runId ?? event.runId,
    parentRunId: event.parentRunId ?? state.parentRunId,
    entities: {
      ...state.entities,
      [bucket]: {
        ...state.entities[bucket],
        [id]: phase,
      },
    },
    updatedAt: event.timestamp,
  };
}

function entityId(event: RunEvent): string | undefined {
  return firstString(event.payload, ENTITY_ID_KEYS) ?? event.id;
}

function researchEntityId(event: RunEvent): string | undefined {
  return firstString(event.payload, ["researchRunId", "researchId", "planId"]) ?? event.id;
}

function firstString(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

function subagentDetail(event: RunEvent): Partial<RunDashboardSubagent> {
  const capabilities = objectArray(event.payload.capabilities);
  const scope = capabilities
    ? {
        capabilities,
        ...(namesForCapabilities(capabilities, "tool") !== undefined
          ? { toolNames: namesForCapabilities(capabilities, "tool") }
          : {}),
        ...(namesForCapabilities(capabilities, "skill") !== undefined
          ? { skillNames: namesForCapabilities(capabilities, "skill") }
          : {}),
        ...(namesForCapabilities(capabilities, "mcp") !== undefined
          ? { mcpServers: namesForCapabilities(capabilities, "mcp") }
          : {}),
      }
    : undefined;
  const contract = {
    ...(firstString(event.payload, ["taskPreview"]) !== undefined
      ? { taskPreview: firstString(event.payload, ["taskPreview"]) }
      : {}),
    ...(firstString(event.payload, ["modelPreference"]) !== undefined
      ? { modelPreference: firstString(event.payload, ["modelPreference"]) }
      : {}),
    ...(objectValue(event.payload.runtimePolicy) !== undefined
      ? { runtimePolicy: objectValue(event.payload.runtimePolicy) }
      : {}),
    ...(objectValue(event.payload.policyCeiling) !== undefined
      ? { policyCeiling: objectValue(event.payload.policyCeiling) }
      : {}),
    ...(stringArray(event.payload.inputArtifactRefs) !== undefined
      ? { inputArtifactRefs: stringArray(event.payload.inputArtifactRefs) }
      : {}),
    ...(objectValue(event.payload.outputSchema) !== undefined
      ? { outputSchema: objectValue(event.payload.outputSchema) }
      : {}),
  };
  const result = {
    ...(firstString(event.payload, ["preview"]) !== undefined
      ? { preview: firstString(event.payload, ["preview"]) }
      : {}),
    ...(stringArray(event.payload.artifactRefs) !== undefined
      ? { artifactRefs: stringArray(event.payload.artifactRefs) }
      : {}),
  };
  return {
    ...(firstString(event.payload, ["parentTaskId"]) !== undefined
      ? { parentTaskId: firstString(event.payload, ["parentTaskId"]) }
      : {}),
    ...(firstString(event.payload, ["parentWorkerId"]) !== undefined
      ? { parentWorkerId: firstString(event.payload, ["parentWorkerId"]) }
      : {}),
    ...(firstString(event.payload, ["workerId"]) !== undefined
      ? { workerId: firstString(event.payload, ["workerId"]) }
      : {}),
    ...(firstString(event.payload, ["lane"]) !== undefined
      ? { lane: firstString(event.payload, ["lane"]) }
      : {}),
    ...(firstString(event.payload, ["traceId"]) !== undefined
      ? { traceId: firstString(event.payload, ["traceId"]) }
      : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(Object.keys(contract).length > 0 ? { contract } : {}),
    ...(Object.keys(result).length > 0 ? { result } : {}),
    ...(firstString(event.payload, ["error"]) !== undefined
      ? { error: firstString(event.payload, ["error"]) }
      : {}),
  };
}

function researchDetail(event: RunEvent): Partial<RunDashboardResearchRun> {
  return {
    ...(firstString(event.payload, ["question", "questionPreview"]) !== undefined
      ? { question: firstString(event.payload, ["question", "questionPreview"]) }
      : {}),
    ...(firstString(event.payload, ["sourcePolicy"]) !== undefined
      ? { sourcePolicy: firstString(event.payload, ["sourcePolicy"]) }
      : {}),
    ...(stringArray(event.payload.requiredSourceKinds) !== undefined
      ? { requiredSourceKinds: stringArray(event.payload.requiredSourceKinds) }
      : stringArray(event.payload.sourceKinds) !== undefined
        ? { requiredSourceKinds: stringArray(event.payload.sourceKinds) }
        : {}),
    ...(firstString(event.payload, ["traceId"]) !== undefined
      ? { traceId: firstString(event.payload, ["traceId"]) }
      : {}),
    ...(firstString(event.payload, ["parentTaskId", "nodeId"]) !== undefined
      ? { parentTaskId: firstString(event.payload, ["parentTaskId", "nodeId"]) }
      : {}),
    ...(firstString(event.payload, ["parentWorkerId"]) !== undefined
      ? { parentWorkerId: firstString(event.payload, ["parentWorkerId"]) }
      : {}),
    ...(firstString(event.payload, ["subagentId"]) !== undefined
      ? { subagentId: firstString(event.payload, ["subagentId"]) }
      : {}),
    ...(numberValue(event.payload.taskCount) !== undefined
      ? { taskCount: numberValue(event.payload.taskCount) }
      : {}),
    ...(Array.isArray(event.payload.tasks)
      ? { taskCount: event.payload.tasks.length }
      : {}),
    ...(stringArray(event.payload.unknowns) !== undefined
      ? { unknowns: stringArray(event.payload.unknowns) }
      : firstString(event.payload, ["message"]) !== undefined &&
          event.kind === "research.limit.reached"
        ? { unknowns: [firstString(event.payload, ["message"]) as string] }
        : {}),
    ...(firstString(event.payload, ["error", "message"]) !== undefined &&
      (event.kind === "research.failed" ||
        event.kind === "research.task.failed" ||
        event.kind === "research.source.failed")
      ? { error: firstString(event.payload, ["error", "message"]) }
      : {}),
  };
}

function researchCitation(
  payload: Record<string, unknown>,
): RunDashboardResearchCitation | undefined {
  const id = firstString(payload, ["citationId", "id"]);
  if (!id) return undefined;
  const citation: ResearchCitationRecord = {
    id,
    addedAt: "",
    ...(firstString(payload, ["sourceKind"]) !== undefined
      ? { sourceKind: firstString(payload, ["sourceKind"]) }
      : {}),
    ...(firstString(payload, ["title"]) !== undefined
      ? { title: firstString(payload, ["title"]) }
      : {}),
    ...(firstString(payload, ["uri"]) !== undefined
      ? { uri: firstString(payload, ["uri"]) }
      : {}),
    ...(firstString(payload, ["traceId"]) !== undefined
      ? { traceId: firstString(payload, ["traceId"]) }
      : {}),
    ...(firstString(payload, ["sourceRecordId"]) !== undefined
      ? { sourceRecordId: firstString(payload, ["sourceRecordId"]) }
      : {}),
    ...(firstString(payload, ["artifactPointer"]) !== undefined
      ? { artifactPointer: firstString(payload, ["artifactPointer"]) }
      : {}),
  };
  return {
    id: citation.id,
    sourceKind: citation.sourceKind,
    title: citation.title,
    uri: citation.uri,
    traceId: citation.traceId,
    sourceRecordId: citation.sourceRecordId,
    artifactPointer: citation.artifactPointer,
  };
}

function appendUnique(values: string[], next: string | undefined): string[] {
  if (!next || values.includes(next)) return values;
  return [...values, next];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : undefined;
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function objectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
  return out.length > 0 ? out : undefined;
}

function namesForCapabilities(
  capabilities: Array<Record<string, unknown>>,
  kind: string,
): string[] | undefined {
  const names = capabilities
    .filter((cap) => cap.kind === kind && typeof cap.name === "string")
    .map((cap) => cap.name as string);
  return names.length > 0 ? names : undefined;
}
