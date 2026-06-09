import type {
  EntityPhase,
  RunDashboardArtifact,
  RunDashboardProjection,
  RunDashboardResearchRun,
  RunDashboardStatus,
  RunDashboardSubagent,
} from "./projection.js";

export type RunInspectorLaneId =
  | "lifecycle"
  | "graph"
  | "subagents"
  | "research"
  | "approvals"
  | "tools"
  | "artifacts";

export interface RunInspectorLane {
  id: RunInspectorLaneId;
  label: string;
  phase: EntityPhase;
  count: number;
  activeCount: number;
  updatedAt?: string;
}

export type RunInspectorFocusKind =
  | "run"
  | "graph"
  | "subagent"
  | "research"
  | "approval"
  | "tool"
  | "artifact";

export interface RunInspectorDetail {
  label: string;
  value: string;
  href?: string;
}

export interface RunInspectorFocus {
  id: string;
  kind: RunInspectorFocusKind;
  label: string;
  phase: EntityPhase;
  summary: string;
  updatedAt?: string;
  details: RunInspectorDetail[];
}

export interface RunInspectorCheckpoint {
  id: string;
  seq?: number;
}

export interface RunInspectorProjection {
  runId?: string;
  status: RunDashboardStatus;
  empty: boolean;
  lanes: RunInspectorLane[];
  focusItems: RunInspectorFocus[];
  selectedFocusId?: string;
  selectedFocus?: RunInspectorFocus;
  checkpoint?: RunInspectorCheckpoint;
}

export interface RunInspectorOptions {
  selectedFocusId?: string;
  maxFocusItems?: number;
}

const ACTIVE_PHASES = new Set<EntityPhase>([
  "pending",
  "ready",
  "running",
  "requested",
  "created",
  "updated",
]);

const TERMINAL_PHASES = new Set<EntityPhase>(["completed", "failed", "resolved"]);

const statusToPhase = (status: RunDashboardStatus): EntityPhase => {
  if (status === "failed") return "failed";
  if (status === "completed" || status === "drained") return "completed";
  if (status === "running") return "running";
  return "pending";
};

const activeCount = (phases: Iterable<EntityPhase>): number => {
  let count = 0;
  for (const phase of phases) {
    if (ACTIVE_PHASES.has(phase)) count += 1;
  }
  return count;
};

const aggregatePhase = (phases: readonly EntityPhase[]): EntityPhase => {
  if (phases.includes("failed")) return "failed";
  if (phases.includes("running")) return "running";
  if (phases.includes("requested")) return "requested";
  if (phases.includes("created") || phases.includes("updated")) return "updated";
  if (phases.length > 0 && phases.every((phase) => TERMINAL_PHASES.has(phase))) {
    return phases.includes("resolved") ? "resolved" : "completed";
  }
  if (phases.includes("ready")) return "ready";
  return "pending";
};

const latestTimestamp = (values: Array<string | undefined>): string | undefined =>
  values
    .filter((value): value is string => value !== undefined)
    .sort((a, b) => b.localeCompare(a))[0];

const compareByUpdatedDesc = <T extends { id: string; updatedAt?: string }>(
  a: T,
  b: T,
): number => {
  const byUpdated = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  if (byUpdated !== 0) return byUpdated;
  return a.id.localeCompare(b.id);
};

const detail = (
  label: string,
  value: string | number | undefined,
  href?: string,
): RunInspectorDetail[] => {
  if (value === undefined) return [];
  const normalized = String(value);
  if (normalized.trim().length === 0) return [];
  return [{ label, value: normalized, ...(href !== undefined ? { href } : {}) }];
};

const listValue = (values: readonly string[] | undefined): string | undefined =>
  values && values.length > 0 ? values.join(", ") : undefined;

const phaseEntries = (items: Record<string, EntityPhase>) => Object.entries(items);

const countLane = (
  id: RunInspectorLaneId,
  label: string,
  items: Record<string, EntityPhase>,
  updatedAt?: string,
): RunInspectorLane => {
  const phases = Object.values(items);
  return {
    id,
    label,
    count: phases.length,
    activeCount: activeCount(phases),
    phase: aggregatePhase(phases),
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
};

export function createRunInspector(
  projection: RunDashboardProjection,
  options: RunInspectorOptions = {},
): RunInspectorProjection {
  const lifecyclePhase = statusToPhase(projection.status);
  const lanes: RunInspectorLane[] = [
    {
      id: "lifecycle",
      label: "Lifecycle",
      count: projection.runId ? 1 : 0,
      activeCount: projection.runId && ACTIVE_PHASES.has(lifecyclePhase) ? 1 : 0,
      phase: lifecyclePhase,
      ...(projection.updatedAt !== undefined ? { updatedAt: projection.updatedAt } : {}),
    },
    {
      id: "graph",
      label: "Graph",
      count: projection.graph.nodeCount,
      activeCount: projection.graph.runningNodeCount,
      phase: graphPhase(projection),
      ...(projection.graph.updatedAt !== undefined ? { updatedAt: projection.graph.updatedAt } : {}),
    },
    countLane("subagents", "Subagents", projection.entities.subagents, latestTimestamp(
      Object.values(projection.subagentDetails).map((item) => item.updatedAt),
    )),
    countLane("research", "Research", projection.entities.research, latestTimestamp(
      Object.values(projection.researchRuns).map((item) => item.updatedAt),
    )),
    countLane("approvals", "Approvals", projection.entities.approvals, projection.updatedAt),
    countLane("tools", "Tools", projection.entities.tools, projection.updatedAt),
    countLane("artifacts", "Artifacts", projection.entities.artifacts, latestTimestamp(
      Object.values(projection.artifactDetails).map((item) => item.updatedAt),
    )),
  ];

  const focusItems = buildFocusItems(projection, options.maxFocusItems ?? 12);
  const selectedFocus =
    focusItems.find((item) => item.id === options.selectedFocusId) ?? focusItems[0];

  return {
    ...(projection.runId !== undefined ? { runId: projection.runId } : {}),
    status: projection.status,
    empty: projection.runId === undefined && focusItems.length <= 1,
    lanes,
    focusItems,
    ...(selectedFocus !== undefined ? { selectedFocus, selectedFocusId: selectedFocus.id } : {}),
    ...(projection.graph.lastCheckpointId !== undefined
      ? {
          checkpoint: {
            id: projection.graph.lastCheckpointId,
            ...(projection.graph.lastCheckpointSeq !== undefined
              ? { seq: projection.graph.lastCheckpointSeq }
              : {}),
          },
        }
      : {}),
  };
}

function graphPhase(projection: RunDashboardProjection): EntityPhase {
  if (projection.graph.failedNodeCount > 0) return "failed";
  if (projection.graph.runningNodeCount > 0) return "running";
  if (
    projection.graph.nodeCount > 0 &&
    projection.graph.completedNodeCount === projection.graph.nodeCount
  ) {
    return "completed";
  }
  return "pending";
}

function buildFocusItems(
  projection: RunDashboardProjection,
  maxFocusItems: number,
): RunInspectorFocus[] {
  const items: RunInspectorFocus[] = [runFocus(projection)];

  if (projection.graph.nodeCount > 0 || projection.graph.lastCheckpointId) {
    items.push(graphFocus(projection));
  }

  const subagentItems = Object.values(projection.subagentDetails)
    .sort(compareByUpdatedDesc)
    .map(subagentFocus);
  const researchItems = Object.values(projection.researchRuns)
    .sort(compareByUpdatedDesc)
    .map(researchFocus);
  const approvalItems = phaseEntries(projection.entities.approvals)
    .filter(([, phase]) => phase === "requested")
    .map(([id, phase]) => approvalFocus(id, phase));
  const toolItems = phaseEntries(projection.entities.tools)
    .filter(([, phase]) => phase === "running" || phase === "failed")
    .map(([id, phase]) => entityFocus("tool", id, phase));
  const artifactItems = Object.values(projection.artifactDetails)
    .sort(compareByUpdatedDesc)
    .map(artifactFocus);

  items.push(
    ...approvalItems,
    ...subagentItems,
    ...researchItems,
    ...toolItems,
    ...artifactItems,
  );

  return items.slice(0, Math.max(1, maxFocusItems));
}

function runFocus(projection: RunDashboardProjection): RunInspectorFocus {
  const latest = projection.latestEvents[0];
  const details = [
    ...detail("Run", projection.runId),
    ...detail("Parent", projection.parentRunId),
    ...detail("Created", projection.createdAt),
    ...detail("Started", projection.startedAt),
    ...detail("Ended", projection.endedAt),
    ...detail("Latest", latest?.title),
    ...detail("Error", projection.errorMessage),
  ];
  return {
    id: "run:lifecycle",
    kind: "run",
    label: projection.runId ?? "Ready",
    phase: statusToPhase(projection.status),
    summary: projection.errorMessage ?? latest?.detail ?? latest?.title ?? "Waiting for runtime events",
    ...(projection.updatedAt !== undefined ? { updatedAt: projection.updatedAt } : {}),
    details,
  };
}

function graphFocus(projection: RunDashboardProjection): RunInspectorFocus {
  const graph = projection.graph;
  const details = [
    ...detail("Graph", graph.graphId),
    ...detail("Root", graph.rootNodeId),
    ...detail("Nodes", graph.nodeCount),
    ...detail("Edges", graph.edgeCount),
    ...detail("Running", graph.runningNodeCount),
    ...detail("Failed", graph.failedNodeCount),
    ...detail("Supersteps", graph.superstepCount),
    ...detail("Checkpoint", graph.lastCheckpointId),
  ];
  return {
    id: "run:graph",
    kind: "graph",
    label: graph.graphId ?? "Execution graph",
    phase: graphPhase(projection),
    summary: `${graph.completedNodeCount}/${graph.nodeCount} nodes completed`,
    ...(graph.updatedAt !== undefined ? { updatedAt: graph.updatedAt } : {}),
    details,
  };
}

function subagentFocus(subagent: RunDashboardSubagent): RunInspectorFocus {
  const capabilitySummary = [
    ...((subagent.scope?.toolNames ?? []).map((name) => `tool:${name}`)),
    ...((subagent.scope?.skillNames ?? []).map((name) => `skill:${name}`)),
    ...((subagent.scope?.mcpServers ?? []).map((name) => `mcp:${name}`)),
  ];
  const details = [
    ...detail("Worker", subagent.workerId),
    ...detail("Parent task", subagent.parentTaskId),
    ...detail("Parent worker", subagent.parentWorkerId),
    ...detail("Lane", subagent.lane),
    ...detail("Trace", subagent.traceId),
    ...detail("Capabilities", listValue(capabilitySummary)),
    ...detail("Model", subagent.contract?.modelPreference),
    ...detail("Artifacts", listValue(subagent.result?.artifactRefs)),
    ...detail("Error", subagent.error),
  ];
  return {
    id: `subagent:${subagent.id}`,
    kind: "subagent",
    label: subagent.id,
    phase: subagent.phase,
    summary:
      subagent.result?.preview ??
      subagent.contract?.taskPreview ??
      subagent.lane ??
      "Delegated worker",
    updatedAt: subagent.updatedAt,
    details,
  };
}

function researchFocus(research: RunDashboardResearchRun): RunInspectorFocus {
  const citation = research.latestCitation;
  const details = [
    ...detail("Question", research.question),
    ...detail("Sources", listValue(research.requiredSourceKinds)),
    ...detail("Policy", research.sourcePolicy),
    ...detail("Tasks", research.taskCount),
    ...detail("Evidence", research.evidenceCount),
    ...detail("Citations", research.citationCount),
    ...detail("Trace", research.traceId),
    ...detail("Subagent", research.subagentId),
    ...detail("Latest citation", citation?.title ?? citation?.uri, citation?.uri),
    ...detail("Unknowns", listValue(research.unknowns)),
    ...detail("Error", research.error),
  ];
  return {
    id: `research:${research.id}`,
    kind: "research",
    label: research.question ?? research.id,
    phase: research.phase,
    summary: citation?.title ?? `${research.evidenceCount} evidence records`,
    updatedAt: research.updatedAt,
    details,
  };
}

function metadataSummary(
  metadata: Record<string, string | number | boolean> | undefined,
): string | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${String(value)}`);
  return entries.length > 0 ? entries.join(", ") : undefined;
}

function artifactFocus(artifact: RunDashboardArtifact): RunInspectorFocus {
  const details = [
    ...detail("Artifact", artifact.id),
    ...detail("Kind", artifact.kind),
    ...detail("Path", artifact.path),
    ...detail("Created", artifact.createdAt),
    ...detail("Updated", artifact.updatedAt),
    ...detail("Trace", artifact.traceId),
    ...detail("Metadata", metadataSummary(artifact.metadata)),
  ];
  return {
    id: `artifact:${artifact.id}`,
    kind: "artifact",
    label: artifact.title ?? artifact.path ?? artifact.id,
    phase: artifact.phase,
    summary: artifact.summary ?? artifact.path ?? artifact.kind ?? artifact.phase,
    updatedAt: artifact.updatedAt,
    details,
  };
}

function approvalFocus(id: string, phase: EntityPhase): RunInspectorFocus {
  return {
    id: `approval:${id}`,
    kind: "approval",
    label: id,
    phase,
    summary: "Decision required",
    details: detail("Ticket", id),
  };
}

function entityFocus(
  kind: "tool",
  id: string,
  phase: EntityPhase,
): RunInspectorFocus {
  return {
    id: `${kind}:${id}`,
    kind,
    label: id,
    phase,
    summary: phase,
    details: detail("Tool", id),
  };
}
