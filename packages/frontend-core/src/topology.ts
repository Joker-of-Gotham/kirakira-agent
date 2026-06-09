import type {
  RuntimeOrchestrationManifest,
  RuntimeOrchestrationRoleManifest,
} from "@kirakira/runtime-contracts";
import type {
  EntityPhase,
  RunDashboardGraphNode,
  RunDashboardProjection,
  RunDashboardSubagent,
} from "./projection.js";

export interface SubagentTopologySummary {
  profileName?: string;
  handoffMode?: string;
  defaultRole?: string;
  hasManifest: boolean;
  laneCount: number;
  roleCount: number;
  manifestRoleCount: number;
  plannedTaskCount: number;
  workerCount: number;
  activeWorkerCount: number;
  mismatchCount: number;
  handoffCount: number;
}

export interface SubagentTopologyLane {
  id: string;
  label: string;
  capacity?: number;
  roleCount: number;
  plannedTaskCount: number;
  workerCount: number;
  activeWorkerCount: number;
  mismatchCount: number;
  roles: SubagentTopologyRole[];
}

export interface SubagentTopologyRole {
  id: string;
  label: string;
  description?: string;
  laneId: string;
  sources: SubagentTopologySource[];
  phase: EntityPhase;
  model?: string;
  maxTurns?: number;
  context?: string;
  toolScope: string[];
  skillScope: string[];
  mcpServers: string[];
  permissionLabels: string[];
  capabilityLabels: string[];
  handoffSources: string[];
  handoffTargets: string[];
  plannedTasks: SubagentTopologyTask[];
  workers: SubagentTopologyWorker[];
  plannedTaskCount: number;
  workerCount: number;
  activeWorkerCount: number;
  mismatchCount: number;
}

export interface SubagentTopologyTask {
  id: string;
  phase: EntityPhase;
  description?: string;
  requestedLane?: string;
  workerId?: string;
  updatedAt?: string;
}

export interface SubagentTopologyWorker {
  id: string;
  phase: EntityPhase;
  parentTaskId?: string;
  parentWorkerId?: string;
  workerId?: string;
  role?: string;
  lane?: string;
  requestedLane?: string;
  traceId?: string;
  taskPreview?: string;
  capabilityLabels: string[];
  resultPreview?: string;
  error?: string;
  updatedAt: string;
}

export interface SubagentTopologyView {
  summary: SubagentTopologySummary;
  lanes: SubagentTopologyLane[];
  roles: SubagentTopologyRole[];
}

export type SubagentTopologySource = "manifest" | "graph" | "runtime";

interface RoleAccumulator {
  id: string;
  manifest?: RuntimeOrchestrationRoleManifest;
  laneId?: string;
  order: number;
  sources: Set<SubagentTopologySource>;
  plannedTasks: SubagentTopologyTask[];
  workers: SubagentTopologyWorker[];
  handoffSources: Set<string>;
  handoffTargets: Set<string>;
}

const UNASSIGNED_LANE = "unassigned";
const UNASSIGNED_ROLE = "unassigned";

const PHASE_WEIGHT: Record<EntityPhase, number> = {
  failed: 70,
  running: 60,
  requested: 50,
  ready: 40,
  pending: 30,
  created: 20,
  updated: 20,
  completed: 10,
  resolved: 10,
};

export function createSubagentTopologyView(
  projection: RunDashboardProjection,
  manifest?: RuntimeOrchestrationManifest,
): SubagentTopologyView {
  let order = 0;
  const laneOrder = new Map<string, number>();
  const roles = new Map<string, RoleAccumulator>();

  const registerLane = (laneId: string) => {
    if (!laneOrder.has(laneId)) {
      laneOrder.set(laneId, laneOrder.size);
    }
  };

  for (const laneId of Object.keys(manifest?.lanes ?? {})) {
    registerLane(laneId);
  }

  const roleLaneById = new Map<string, string>();
  for (const role of manifest?.roles ?? []) {
    if (role.lane !== undefined) {
      roleLaneById.set(role.id, role.lane);
      registerLane(role.lane);
    }
    const acc = ensureRole(roles, role.id, order++);
    acc.manifest = role;
    acc.laneId = role.lane;
    acc.sources.add("manifest");
  }

  for (const handoff of manifest?.handoffs ?? []) {
    const source = ensureRole(roles, handoff.from, order++);
    source.sources.add("manifest");
    source.handoffTargets.add(handoff.to);
    const target = ensureRole(roles, handoff.to, order++);
    target.sources.add("manifest");
    target.handoffSources.add(handoff.from);
  }

  for (const node of Object.values(projection.graph.nodes)) {
    if (!isSubagentGraphNode(node)) continue;
    const roleId = resolveGraphRoleId(node, manifest);
    const laneId = roleLaneById.get(roleId) ?? node.requestedLane ?? UNASSIGNED_LANE;
    registerLane(laneId);
    const acc = ensureRole(roles, roleId, order++);
    acc.laneId ??= laneId;
    acc.sources.add("graph");
    acc.plannedTasks.push({
      id: node.id,
      phase: node.phase,
      description: node.description,
      requestedLane: node.requestedLane,
      workerId: node.workerId,
      updatedAt: node.updatedAt,
    });
  }

  for (const agent of Object.values(projection.subagentDetails)) {
    const roleId = resolveWorkerRoleId(agent, manifest);
    const laneId = roleLaneById.get(roleId) ?? agent.lane ?? agent.requestedLane ?? UNASSIGNED_LANE;
    registerLane(laneId);
    const acc = ensureRole(roles, roleId, order++);
    acc.laneId ??= laneId;
    acc.sources.add("runtime");
    acc.workers.push({
      id: agent.id,
      phase: agent.phase,
      parentTaskId: agent.parentTaskId,
      parentWorkerId: agent.parentWorkerId,
      workerId: agent.workerId,
      role: agent.role ?? agent.contract?.role,
      lane: agent.lane,
      requestedLane: agent.requestedLane ?? agent.contract?.requestedLane,
      traceId: agent.traceId,
      taskPreview: agent.contract?.taskPreview,
      capabilityLabels: capabilityLabelsFromWorker(agent),
      resultPreview: agent.result?.preview,
      error: agent.error,
      updatedAt: agent.updatedAt,
    });
  }

  registerLane(UNASSIGNED_LANE);

  const roleViews = Array.from(roles.values())
    .map((acc) => roleView(acc))
    .sort((a, b) => compareRoles(roles, a.id, b.id));
  const laneViews = buildLaneViews(roleViews, laneOrder, manifest);
  const summary: SubagentTopologySummary = {
    profileName: manifest?.profileName,
    handoffMode: manifest?.handoffMode,
    defaultRole: manifest?.defaultRole,
    hasManifest: manifest !== undefined,
    laneCount: laneViews.length,
    roleCount: roleViews.length,
    manifestRoleCount: manifest?.roles?.length ?? 0,
    plannedTaskCount: sum(roleViews, (role) => role.plannedTaskCount),
    workerCount: sum(roleViews, (role) => role.workerCount),
    activeWorkerCount: sum(roleViews, (role) => role.activeWorkerCount),
    mismatchCount: sum(roleViews, (role) => role.mismatchCount),
    handoffCount: manifest?.handoffs?.length ?? 0,
  };

  return { summary, lanes: laneViews, roles: roleViews };
}

function ensureRole(
  roles: Map<string, RoleAccumulator>,
  id: string,
  order: number,
): RoleAccumulator {
  const key = id || UNASSIGNED_ROLE;
  const existing = roles.get(key);
  if (existing) return existing;
  const acc: RoleAccumulator = {
    id: key,
    order,
    sources: new Set(),
    plannedTasks: [],
    workers: [],
    handoffSources: new Set(),
    handoffTargets: new Set(),
  };
  roles.set(key, acc);
  return acc;
}

function isSubagentGraphNode(node: RunDashboardGraphNode): boolean {
  return node.kind === "subagent" || node.role !== undefined;
}

function resolveGraphRoleId(
  node: RunDashboardGraphNode,
  manifest: RuntimeOrchestrationManifest | undefined,
): string {
  return node.role ?? manifest?.defaultRole ?? UNASSIGNED_ROLE;
}

function resolveWorkerRoleId(
  agent: RunDashboardSubagent,
  manifest: RuntimeOrchestrationManifest | undefined,
): string {
  return agent.role ?? agent.contract?.role ?? manifest?.defaultRole ?? UNASSIGNED_ROLE;
}

function roleView(acc: RoleAccumulator): SubagentTopologyRole {
  const laneId = acc.laneId ?? acc.manifest?.lane ?? UNASSIGNED_LANE;
  const phases = [
    ...acc.plannedTasks.map((task) => task.phase),
    ...acc.workers.map((worker) => worker.phase),
  ];
  const mismatchCount =
    acc.plannedTasks.filter((task) => isLaneMismatch(task.requestedLane, laneId)).length +
    acc.workers.filter((worker) =>
      isLaneMismatch(worker.requestedLane, laneId) ||
      isLaneMismatch(worker.lane, laneId),
    ).length;
  const toolScope = acc.manifest?.toolScope ?? [];
  const skillScope = acc.manifest?.skillScope ?? [];
  const mcpServers = acc.manifest?.mcpServers ?? [];
  const permissionLabels = acc.manifest?.permissionLabels ?? [];
  const manifestCapabilityLabels = scopedCapabilityLabels({
    toolScope,
    skillScope,
    mcpServers,
    permissionLabels,
  });
  const workerCapabilityLabels = acc.workers.flatMap((worker) => worker.capabilityLabels);

  return {
    id: acc.id,
    label: labelFromId(acc.id),
    description: acc.manifest?.description,
    laneId,
    sources: Array.from(acc.sources).sort(),
    phase: aggregatePhase(phases),
    model: acc.manifest?.model,
    maxTurns: acc.manifest?.maxTurns,
    context: acc.manifest?.context,
    toolScope,
    skillScope,
    mcpServers,
    permissionLabels,
    capabilityLabels: unique([...manifestCapabilityLabels, ...workerCapabilityLabels]),
    handoffSources: Array.from(acc.handoffSources).sort(),
    handoffTargets: Array.from(acc.handoffTargets).sort(),
    plannedTasks: acc.plannedTasks.sort(compareTasks),
    workers: acc.workers.sort(compareWorkers),
    plannedTaskCount: acc.plannedTasks.length,
    workerCount: acc.workers.length,
    activeWorkerCount: acc.workers.filter((worker) => isActivePhase(worker.phase)).length,
    mismatchCount,
  };
}

function buildLaneViews(
  roles: SubagentTopologyRole[],
  laneOrder: Map<string, number>,
  manifest: RuntimeOrchestrationManifest | undefined,
): SubagentTopologyLane[] {
  const grouped = new Map<string, SubagentTopologyRole[]>();
  for (const role of roles) {
    const list = grouped.get(role.laneId) ?? [];
    list.push(role);
    grouped.set(role.laneId, list);
  }

  return Array.from(grouped.entries())
    .map(([laneId, laneRoles]) => ({
      id: laneId,
      label: labelFromId(laneId),
      capacity: manifest?.lanes?.[laneId as keyof NonNullable<RuntimeOrchestrationManifest["lanes"]>]?.capacity,
      roleCount: laneRoles.length,
      plannedTaskCount: sum(laneRoles, (role) => role.plannedTaskCount),
      workerCount: sum(laneRoles, (role) => role.workerCount),
      activeWorkerCount: sum(laneRoles, (role) => role.activeWorkerCount),
      mismatchCount: sum(laneRoles, (role) => role.mismatchCount),
      roles: laneRoles,
    }))
    .sort((a, b) => compareLane(laneOrder, a.id, b.id));
}

function capabilityLabelsFromWorker(agent: RunDashboardSubagent): string[] {
  const scope = agent.scope;
  if (!scope) return [];
  return scopedCapabilityLabels({
    toolScope: scope.toolNames ?? [],
    skillScope: scope.skillNames ?? [],
    mcpServers: scope.mcpServers ?? [],
    permissionLabels: [],
  });
}

function scopedCapabilityLabels(scope: {
  toolScope: string[];
  skillScope: string[];
  mcpServers: string[];
  permissionLabels: string[];
}): string[] {
  return unique([
    ...scope.toolScope.map((name) => `tool:${name}`),
    ...scope.skillScope.map((name) => `skill:${name}`),
    ...scope.mcpServers.map((name) => `mcp:${name}`),
    ...scope.permissionLabels.map((name) => `policy:${name}`),
  ]);
}

function aggregatePhase(phases: EntityPhase[]): EntityPhase {
  if (phases.length === 0) return "pending";
  return phases.reduce((current, phase) =>
    PHASE_WEIGHT[phase] > PHASE_WEIGHT[current] ? phase : current,
  );
}

function isActivePhase(phase: EntityPhase): boolean {
  return !["completed", "failed", "resolved"].includes(phase);
}

function isLaneMismatch(requestedLane: string | undefined, laneId: string): boolean {
  return requestedLane !== undefined &&
    laneId !== UNASSIGNED_LANE &&
    requestedLane !== laneId;
}

function labelFromId(id: string): string {
  return id
    .split(/[-_.\s]+/u)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || id;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function sum<T>(items: T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}

function compareLane(laneOrder: Map<string, number>, left: string, right: string): number {
  const leftOrder = laneOrder.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = laneOrder.get(right) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.localeCompare(right);
}

function compareRoles(
  roles: Map<string, RoleAccumulator>,
  left: string,
  right: string,
): number {
  const leftOrder = roles.get(left)?.order ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = roles.get(right)?.order ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.localeCompare(right);
}

function compareTasks(left: SubagentTopologyTask, right: SubagentTopologyTask): number {
  return (left.updatedAt ?? "").localeCompare(right.updatedAt ?? "") ||
    left.id.localeCompare(right.id);
}

function compareWorkers(left: SubagentTopologyWorker, right: SubagentTopologyWorker): number {
  return right.updatedAt.localeCompare(left.updatedAt) ||
    left.id.localeCompare(right.id);
}
