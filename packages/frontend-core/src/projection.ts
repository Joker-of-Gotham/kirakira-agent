import type {
  RunEvent,
  RunEventKind,
  SubagentContractRecord,
  SubagentResultRecord,
  SubagentScopeRecord,
} from "@kirakira/event-store";

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

export interface RunDashboardEntityMaps {
  tasks: Record<string, EntityPhase>;
  subagents: Record<string, EntityPhase>;
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
] as const;

export function createEmptyRunDashboard(runId?: string): RunDashboardProjection {
  return {
    ...(runId !== undefined ? { runId } : {}),
    status: "idle",
    latestEvents: [],
    entities: {
      tasks: {},
      subagents: {},
      tools: {},
      approvals: {},
      artifacts: {},
    },
    subagentDetails: {},
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
): RunDashboardProjection {
  const id = entityId(event);
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
