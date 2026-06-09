import type { RunEvent, RunEventKind } from "@kirakira/runtime-contracts";
import {
  summarizeRunEvent,
  type EntityPhase,
  type RunDashboardGraphNode,
  type RunDashboardProjection,
  type RuntimeEventSummary,
} from "./projection.js";

export type RunWorkstreamColumnId = "now" | "next" | "blocked" | "done";
export type RunWorkstreamItemKind =
  | "run"
  | "graph"
  | "task"
  | "subagent"
  | "research"
  | "approval"
  | "tool"
  | "artifact"
  | "checkpoint"
  | "control";
export type RunWorkstreamTone = "neutral" | "active" | "success" | "warning" | "critical";
export type RunWorkstreamAttentionSeverity = "critical" | "warning" | "info";

export interface RunWorkstreamDetail {
  label: string;
  value: string;
  href?: string;
}

export interface RunWorkstreamCard {
  id: string;
  kind: RunWorkstreamItemKind;
  title: string;
  phase: EntityPhase;
  tone: RunWorkstreamTone;
  focusId?: string;
  detail?: string;
  owner?: string;
  lane?: string;
  updatedAt?: string;
  meta: string[];
  attention: boolean;
  eventIds: string[];
  details: RunWorkstreamDetail[];
}

export interface RunWorkstreamColumn {
  id: RunWorkstreamColumnId;
  label: string;
  description: string;
  cards: RunWorkstreamCard[];
}

export interface RunWorkstreamActivity {
  id: string;
  eventId: string;
  itemId?: string;
  focusId?: string;
  kind: RunEventKind;
  tone: RunWorkstreamTone;
  title: string;
  detail?: string;
  timestamp: string;
  checkpointSeq?: number;
}

export interface RunWorkstreamAttentionItem {
  id: string;
  itemId?: string;
  focusId?: string;
  severity: RunWorkstreamAttentionSeverity;
  title: string;
  detail: string;
  actionLabel: string;
}

export interface RunWorkstreamDetailDrawer {
  id: string;
  title: string;
  kind: RunWorkstreamItemKind | "attention" | "activity";
  tone: RunWorkstreamTone;
  summary: string;
  updatedAt?: string;
  details: RunWorkstreamDetail[];
  relatedEventIds: string[];
}

export interface RunWorkstreamSummary {
  totalCards: number;
  activeCards: number;
  blockedCards: number;
  doneCards: number;
  attentionCount: number;
  latestActivityAt?: string;
}

export interface RunWorkstreamProjection {
  runId?: string;
  columns: RunWorkstreamColumn[];
  activity: RunWorkstreamActivity[];
  attention: RunWorkstreamAttentionItem[];
  selectedItemId?: string;
  detail?: RunWorkstreamDetailDrawer;
  summary: RunWorkstreamSummary;
}

export interface RunWorkstreamOptions {
  selectedItemId?: string;
  maxActivityItems?: number;
  maxCardsPerColumn?: number;
}

interface EntityMeta {
  id: string;
  itemId: string;
  focusId?: string;
  title?: string;
  detail?: string;
  owner?: string;
  lane?: string;
  updatedAt: string;
  eventIds: string[];
  details: RunWorkstreamDetail[];
}

const DEFAULT_ACTIVITY_LIMIT = 18;
const DEFAULT_COLUMN_LIMIT = 10;

const COLUMN_META: Omit<RunWorkstreamColumn, "cards">[] = [
  {
    id: "now",
    label: "Now",
    description: "Active, ready, and newly produced work",
  },
  {
    id: "next",
    label: "Next",
    description: "Planned work waiting for execution",
  },
  {
    id: "blocked",
    label: "Blocked",
    description: "Failures and decisions that need attention",
  },
  {
    id: "done",
    label: "Done",
    description: "Resolved or completed work",
  },
];

const ACTIVE_PHASES = new Set<EntityPhase>([
  "pending",
  "ready",
  "running",
  "requested",
  "created",
  "updated",
]);

const DONE_PHASES = new Set<EntityPhase>(["completed", "resolved"]);

const phaseTone = (phase: EntityPhase): RunWorkstreamTone => {
  if (phase === "failed") return "critical";
  if (phase === "completed" || phase === "resolved") return "success";
  if (phase === "requested" || phase === "pending") return "warning";
  if (phase === "running" || phase === "ready" || phase === "created" || phase === "updated") {
    return "active";
  }
  return "neutral";
};

export function createRunWorkstream(
  projection: RunDashboardProjection,
  events: readonly RunEvent[],
  options: RunWorkstreamOptions = {},
): RunWorkstreamProjection {
  const entityMeta = buildEntityMeta(events);
  const cards = buildCards(projection, entityMeta);
  const columns = buildColumns(cards, options.maxCardsPerColumn ?? DEFAULT_COLUMN_LIMIT);
  const activity = buildActivity(events, entityMeta, options.maxActivityItems ?? DEFAULT_ACTIVITY_LIMIT);
  const attention = buildAttention(projection, cards, entityMeta);
  const selectedItemId = resolveSelectedItemId(options.selectedItemId, cards, activity, attention);
  const detail = selectedItemId
    ? buildDetailDrawer(selectedItemId, cards, activity, attention)
    : undefined;

  return {
    ...(projection.runId !== undefined ? { runId: projection.runId } : {}),
    columns,
    activity,
    attention,
    ...(selectedItemId !== undefined ? { selectedItemId } : {}),
    ...(detail !== undefined ? { detail } : {}),
    summary: {
      totalCards: cards.length,
      activeCards: cards.filter((card) => ACTIVE_PHASES.has(card.phase)).length,
      blockedCards: columns.find((column) => column.id === "blocked")?.cards.length ?? 0,
      doneCards: columns.find((column) => column.id === "done")?.cards.length ?? 0,
      attentionCount: attention.length,
      ...(activity[0]?.timestamp !== undefined ? { latestActivityAt: activity[0].timestamp } : {}),
    },
  };
}

function buildCards(
  projection: RunDashboardProjection,
  meta: Map<string, EntityMeta>,
): RunWorkstreamCard[] {
  const cards = new Map<string, RunWorkstreamCard>();

  if (projection.runId) {
    const phase = runPhase(projection.status);
    cards.set("run:lifecycle", {
      id: "run:lifecycle",
      kind: "run",
      title: projection.runId,
      phase,
      tone: phaseTone(phase),
      focusId: "run:lifecycle",
      detail: projection.errorMessage ?? projection.latestEvents[0]?.detail,
      updatedAt: projection.updatedAt,
      meta: ["runtime"],
      attention: projection.status === "failed",
      eventIds: projection.latestEvents.map((event) => event.id).slice(0, 6),
      details: [
        ...detail("Status", projection.status),
        ...detail("Run", projection.runId),
        ...detail("Created", projection.createdAt),
        ...detail("Started", projection.startedAt),
        ...detail("Ended", projection.endedAt),
        ...detail("Error", projection.errorMessage),
      ],
    });
  }

  for (const node of Object.values(projection.graph.nodes)) {
    addCard(cards, graphNodeCard(node, meta.get(`task:${node.id}`)));
  }

  for (const subagent of Object.values(projection.subagentDetails)) {
    const itemId = `subagent:${subagent.id}`;
    const owner = subagent.role ?? subagent.contract?.role;
    addCard(cards, {
      id: itemId,
      kind: "subagent",
      title: subagent.contract?.taskPreview ?? owner ?? subagent.id,
      phase: subagent.phase,
      tone: phaseTone(subagent.phase),
      focusId: itemId,
      detail: subagent.result?.preview ?? subagent.error ?? subagent.contract?.modelPreference,
      owner,
      lane: subagent.lane ?? subagent.requestedLane,
      updatedAt: subagent.updatedAt,
      meta: compact([owner, subagent.lane ?? subagent.requestedLane, subagent.workerId]),
      attention: subagent.phase === "failed",
      eventIds: meta.get(itemId)?.eventIds ?? [],
      details: [
        ...detail("Subagent", subagent.id),
        ...detail("Role", owner),
        ...detail("Lane", subagent.lane),
        ...detail("Requested lane", subagent.requestedLane),
        ...detail("Worker", subagent.workerId),
        ...detail("Parent task", subagent.parentTaskId),
        ...detail("Trace", subagent.traceId),
        ...detail("Result", subagent.result?.preview),
        ...detail("Error", subagent.error),
      ],
    });
  }

  for (const research of Object.values(projection.researchRuns)) {
    const itemId = `research:${research.id}`;
    addCard(cards, {
      id: itemId,
      kind: "research",
      title: research.question ?? research.id,
      phase: research.phase,
      tone: phaseTone(research.phase),
      focusId: itemId,
      detail: research.latestCitation?.title ?? research.error ?? `${research.evidenceCount} evidence`,
      owner: research.subagentId,
      lane: research.sourcePolicy,
      updatedAt: research.updatedAt,
      meta: compact([
        research.sourcePolicy,
        `${research.evidenceCount} evidence`,
        `${research.citationCount} citations`,
      ]),
      attention: research.phase === "failed",
      eventIds: meta.get(itemId)?.eventIds ?? [],
      details: [
        ...detail("Research", research.id),
        ...detail("Question", research.question),
        ...detail("Policy", research.sourcePolicy),
        ...detail("Evidence", research.evidenceCount),
        ...detail("Citations", research.citationCount),
        ...detail("Subagent", research.subagentId),
        ...detail("Latest citation", research.latestCitation?.title ?? research.latestCitation?.uri, research.latestCitation?.uri),
        ...detail("Error", research.error),
      ],
    });
  }

  for (const [approvalId, phase] of Object.entries(projection.entities.approvals)) {
    const itemId = `approval:${approvalId}`;
    const itemMeta = meta.get(itemId);
    addCard(cards, {
      id: itemId,
      kind: "approval",
      title: itemMeta?.title ?? approvalId,
      phase,
      tone: phase === "requested" ? "critical" : phaseTone(phase),
      focusId: itemId,
      detail: itemMeta?.detail ?? (phase === "requested" ? "Decision required" : "Decision resolved"),
      updatedAt: itemMeta?.updatedAt,
      meta: ["approval"],
      attention: phase === "requested",
      eventIds: itemMeta?.eventIds ?? [],
      details: [
        ...detail("Approval", approvalId),
        ...detail("Phase", phase),
        ...detail("Reason", itemMeta?.detail),
      ],
    });
  }

  for (const [toolId, phase] of Object.entries(projection.entities.tools)) {
    const itemId = `tool:${toolId}`;
    const itemMeta = meta.get(itemId);
    if (phase === "completed" && projection.graph.nodeCount > 0) continue;
    addCard(cards, {
      id: itemId,
      kind: "tool",
      title: itemMeta?.title ?? toolId,
      phase,
      tone: phaseTone(phase),
      focusId: itemId,
      detail: itemMeta?.detail,
      owner: itemMeta?.owner,
      updatedAt: itemMeta?.updatedAt,
      meta: compact(["tool", itemMeta?.owner]),
      attention: phase === "failed",
      eventIds: itemMeta?.eventIds ?? [],
      details: [
        ...detail("Tool", toolId),
        ...detail("Phase", phase),
        ...detail("Detail", itemMeta?.detail),
      ],
    });
  }

  for (const artifact of Object.values(projection.artifactDetails)) {
    const itemId = `artifact:${artifact.id}`;
    addCard(cards, {
      id: itemId,
      kind: "artifact",
      title: artifact.title ?? artifact.path ?? artifact.id,
      phase: artifact.phase,
      tone: "success",
      focusId: itemId,
      detail: artifact.summary ?? artifact.kind,
      updatedAt: artifact.updatedAt,
      meta: compact([artifact.kind, artifact.path]),
      attention: false,
      eventIds: meta.get(itemId)?.eventIds ?? [],
      details: [
        ...detail("Artifact", artifact.id),
        ...detail("Kind", artifact.kind),
        ...detail("Path", artifact.path),
        ...detail("Summary", artifact.summary),
        ...detail("Updated", artifact.updatedAt),
      ],
    });
  }

  return [...cards.values()].sort(compareCards);
}

function graphNodeCard(
  node: RunDashboardGraphNode,
  meta?: EntityMeta,
): RunWorkstreamCard {
  const itemId = `task:${node.id}`;
  return {
    id: itemId,
    kind: "task",
    title: node.description ?? meta?.title ?? node.id,
    phase: node.phase,
    tone: phaseTone(node.phase),
    focusId: "run:graph",
    detail: node.error ?? meta?.detail ?? node.kind,
    owner: node.workerId ?? node.role,
    lane: node.requestedLane,
    updatedAt: node.updatedAt ?? meta?.updatedAt,
    meta: compact([node.kind, node.role, node.requestedLane]),
    attention: node.phase === "failed",
    eventIds: meta?.eventIds ?? [],
    details: [
      ...detail("Task", node.id),
      ...detail("Kind", node.kind),
      ...detail("Role", node.role),
      ...detail("Lane", node.requestedLane),
      ...detail("Worker", node.workerId),
      ...detail("Error", node.error),
    ],
  };
}

function addCard(cards: Map<string, RunWorkstreamCard>, card: RunWorkstreamCard): void {
  const previous = cards.get(card.id);
  if (!previous) {
    cards.set(card.id, card);
    return;
  }
  cards.set(card.id, {
    ...previous,
    ...card,
    detail: card.detail ?? previous.detail,
    owner: card.owner ?? previous.owner,
    lane: card.lane ?? previous.lane,
    updatedAt: latest(card.updatedAt, previous.updatedAt),
    meta: unique([...previous.meta, ...card.meta]),
    attention: previous.attention || card.attention,
    eventIds: unique([...previous.eventIds, ...card.eventIds]),
    details: mergeDetails(previous.details, card.details),
  });
}

function buildColumns(cards: RunWorkstreamCard[], maxCardsPerColumn: number): RunWorkstreamColumn[] {
  return COLUMN_META.map((column) => ({
    ...column,
    cards: cards
      .filter((card) => columnForCard(card) === column.id)
      .sort(compareCards)
      .slice(0, maxCardsPerColumn),
  }));
}

function columnForCard(card: RunWorkstreamCard): RunWorkstreamColumnId {
  if (card.attention || card.phase === "failed") return "blocked";
  if (card.kind === "artifact" || DONE_PHASES.has(card.phase)) return "done";
  if (card.phase === "pending") return "next";
  return "now";
}

function buildActivity(
  events: readonly RunEvent[],
  meta: Map<string, EntityMeta>,
  maxItems: number,
): RunWorkstreamActivity[] {
  return [...events]
    .sort(compareEventsDesc)
    .slice(0, maxItems)
    .map((event) => {
      const summary = summarizeRunEvent(event);
      const itemId = itemIdForEvent(event);
      const itemMeta = itemId ? meta.get(itemId) : undefined;
      return {
        id: `activity:${event.id}`,
        eventId: event.id,
        ...(itemId !== undefined ? { itemId } : {}),
        ...(itemMeta?.focusId !== undefined ? { focusId: itemMeta.focusId } : {}),
        kind: event.kind,
        tone: toneForEvent(event.kind),
        title: summary.title,
        ...(summary.detail !== undefined ? { detail: summary.detail } : {}),
        timestamp: event.timestamp,
        ...(event.checkpointSeq !== undefined ? { checkpointSeq: event.checkpointSeq } : {}),
      };
    });
}

function buildAttention(
  projection: RunDashboardProjection,
  cards: RunWorkstreamCard[],
  meta: Map<string, EntityMeta>,
): RunWorkstreamAttentionItem[] {
  const attention: RunWorkstreamAttentionItem[] = [];

  if (projection.status === "failed") {
    attention.push({
      id: "attention:run:failed",
      itemId: "run:lifecycle",
      focusId: "run:lifecycle",
      severity: "critical",
      title: "Run failed",
      detail: projection.errorMessage ?? "The runtime reported a failed run.",
      actionLabel: "Inspect run",
    });
  }

  for (const approvalId of projection.pendingApprovalIds) {
    const itemId = `approval:${approvalId}`;
    const itemMeta = meta.get(itemId);
    attention.push({
      id: `attention:${itemId}`,
      itemId,
      focusId: itemId,
      severity: "critical",
      title: itemMeta?.title ?? "Approval required",
      detail: itemMeta?.detail ?? approvalId,
      actionLabel: "Open gate",
    });
  }

  for (const card of cards) {
    if (!card.attention || card.kind === "approval" || card.kind === "run") continue;
    attention.push({
      id: `attention:${card.id}`,
      itemId: card.id,
      ...(card.focusId !== undefined ? { focusId: card.focusId } : {}),
      severity: card.phase === "failed" ? "critical" : "warning",
      title: card.title,
      detail: card.detail ?? `${card.kind} needs attention`,
      actionLabel: "Review",
    });
  }

  if (projection.status === "drained") {
    attention.push({
      id: "attention:run:drained",
      itemId: "run:lifecycle",
      focusId: "run:lifecycle",
      severity: "info",
      title: "Runtime drained",
      detail: "The run stream has been drained and will not emit more work.",
      actionLabel: "Inspect run",
    });
  }

  return dedupeAttention(attention).slice(0, 6);
}

function buildDetailDrawer(
  selectedItemId: string,
  cards: RunWorkstreamCard[],
  activity: RunWorkstreamActivity[],
  attention: RunWorkstreamAttentionItem[],
): RunWorkstreamDetailDrawer | undefined {
  const card = cards.find((item) => item.id === selectedItemId);
  if (card) {
    return {
      id: card.id,
      title: card.title,
      kind: card.kind,
      tone: card.tone,
      summary: card.detail ?? card.phase,
      updatedAt: card.updatedAt,
      details: [
        ...detail("Phase", card.phase),
        ...detail("Kind", card.kind),
        ...detail("Owner", card.owner),
        ...detail("Lane", card.lane),
        ...card.details,
      ],
      relatedEventIds: card.eventIds,
    };
  }

  const attentionItem = attention.find((item) => item.id === selectedItemId);
  if (attentionItem) {
    return {
      id: attentionItem.id,
      title: attentionItem.title,
      kind: "attention",
      tone: attentionItem.severity === "critical" ? "critical" : "warning",
      summary: attentionItem.detail,
      details: [
        ...detail("Severity", attentionItem.severity),
        ...detail("Action", attentionItem.actionLabel),
        ...detail("Target", attentionItem.itemId),
      ],
      relatedEventIds: [],
    };
  }

  const activityItem = activity.find((item) => item.id === selectedItemId);
  if (activityItem) {
    return {
      id: activityItem.id,
      title: activityItem.title,
      kind: "activity",
      tone: activityItem.tone,
      summary: activityItem.detail ?? activityItem.kind,
      updatedAt: activityItem.timestamp,
      details: [
        ...detail("Event", activityItem.eventId),
        ...detail("Kind", activityItem.kind),
        ...detail("Checkpoint", activityItem.checkpointSeq),
        ...detail("Target", activityItem.itemId),
      ],
      relatedEventIds: [activityItem.eventId],
    };
  }

  return undefined;
}

function buildEntityMeta(events: readonly RunEvent[]): Map<string, EntityMeta> {
  const meta = new Map<string, EntityMeta>();
  for (const event of events) {
    const itemId = itemIdForEvent(event);
    if (!itemId) continue;
    const previous = meta.get(itemId);
    const summary = summarizeRunEvent(event);
    const next: EntityMeta = {
      id: entityIdFromItemId(itemId),
      itemId,
      focusId: focusIdForItem(itemId),
      title: titleForEvent(event, summary),
      detail: detailForEvent(event, summary),
      owner: firstString(event.payload, ["workerId", "subagentId", "role", "toolId", "toolName"]),
      lane: firstString(event.payload, ["lane", "requestedLane", "sourcePolicy"]),
      updatedAt: event.timestamp,
      eventIds: [...(previous?.eventIds ?? []), event.id],
      details: [
        ...(previous?.details ?? []),
        ...detail("Latest event", summary.title),
        ...detail("Message", detailForEvent(event, summary)),
      ],
    };
    meta.set(itemId, {
      ...previous,
      ...next,
      title: next.title ?? previous?.title,
      detail: next.detail ?? previous?.detail,
      owner: next.owner ?? previous?.owner,
      lane: next.lane ?? previous?.lane,
      eventIds: unique(next.eventIds),
      details: mergeDetails(previous?.details ?? [], next.details),
    });
  }
  return meta;
}

function titleForEvent(event: RunEvent, summary: RuntimeEventSummary): string | undefined {
  if (event.kind.startsWith("approval.")) {
    return firstString(event.payload, ["action", "summary", "message", "reason"]) ?? summary.title;
  }
  if (event.kind.startsWith("task.")) {
    return firstString(event.payload, ["description", "summary", "name", "taskId", "nodeId"]);
  }
  if (event.kind.startsWith("tool.")) {
    return firstString(event.payload, ["toolName", "toolId", "name", "summary", "callId"]);
  }
  if (event.kind.startsWith("research.")) {
    return firstString(event.payload, ["question", "questionPreview", "title", "summary"]);
  }
  if (event.kind.startsWith("artifact.")) {
    return firstString(event.payload, ["title", "path", "artifactPath", "artifactId"]);
  }
  return summary.detail ?? summary.title;
}

function detailForEvent(event: RunEvent, summary: RuntimeEventSummary): string | undefined {
  return firstString(event.payload, [
    "summary",
    "message",
    "error",
    "reason",
    "description",
    "action",
    "toolName",
    "toolId",
    "path",
    "artifactPath",
  ]) ?? summary.detail;
}

function itemIdForEvent(event: RunEvent): string | undefined {
  if (event.kind.startsWith("run.")) return "run:lifecycle";
  if (event.kind === "graph.normalized") return "run:graph";
  if (event.kind === "checkpoint.saved" || event.kind === "checkpoint.restored") {
    const checkpointId = firstString(event.payload, ["checkpointId", "id"]) ?? event.id;
    return `checkpoint:${checkpointId}`;
  }
  if (event.kind.startsWith("task.")) {
    const id = firstString(event.payload, ["nodeId", "taskId", "id"]);
    return id ? `task:${id}` : undefined;
  }
  if (event.kind.startsWith("subagent.")) {
    const id = firstString(event.payload, ["subagentId", "workerId", "id"]);
    return id ? `subagent:${id}` : undefined;
  }
  if (event.kind.startsWith("research.")) {
    const id = firstString(event.payload, ["researchRunId", "researchId", "planId", "id"]);
    return id ? `research:${id}` : undefined;
  }
  if (event.kind.startsWith("approval.")) {
    const id = firstString(event.payload, ["ticketId", "approvalId", "id"]);
    return id ? `approval:${id}` : undefined;
  }
  if (event.kind.startsWith("tool.")) {
    const id = firstString(event.payload, ["callId", "toolCallId", "toolId", "id"]);
    return id ? `tool:${id}` : undefined;
  }
  if (event.kind.startsWith("artifact.")) {
    const id = firstString(event.payload, ["artifactId", "id"]);
    return id ? `artifact:${id}` : undefined;
  }
  if (
    event.kind.startsWith("interrupt.") ||
    event.kind.startsWith("merge.") ||
    event.kind.startsWith("steer.") ||
    event.kind.startsWith("drain.")
  ) {
    return `control:${firstString(event.payload, ["id", "ticketId"]) ?? event.id}`;
  }
  return undefined;
}

function focusIdForItem(itemId: string): string | undefined {
  if (
    itemId.startsWith("run:") ||
    itemId.startsWith("subagent:") ||
    itemId.startsWith("research:") ||
    itemId.startsWith("approval:") ||
    itemId.startsWith("tool:") ||
    itemId.startsWith("artifact:")
  ) {
    return itemId;
  }
  if (itemId.startsWith("task:")) return "run:graph";
  return undefined;
}

function entityIdFromItemId(itemId: string): string {
  const separator = itemId.indexOf(":");
  return separator === -1 ? itemId : itemId.slice(separator + 1);
}

function resolveSelectedItemId(
  selected: string | undefined,
  cards: RunWorkstreamCard[],
  activity: RunWorkstreamActivity[],
  attention: RunWorkstreamAttentionItem[],
): string | undefined {
  if (
    selected &&
    (cards.some((item) => item.id === selected) ||
      activity.some((item) => item.id === selected) ||
      attention.some((item) => item.id === selected))
  ) {
    return selected;
  }
  return (
    attention[0]?.id ??
    cards.find((card) => columnForCard(card) === "now")?.id ??
    cards[0]?.id ??
    activity[0]?.id
  );
}

function toneForEvent(kind: RunEventKind): RunWorkstreamTone {
  if (kind.endsWith(".failed") || kind === "run.failed" || kind === "interrupt.raised") {
    return "critical";
  }
  if (kind === "approval.requested" || kind === "drain.requested" || kind === "merge.proposed") {
    return "warning";
  }
  if (kind.endsWith(".completed") || kind === "approval.resolved" || kind === "run.completed") {
    return "success";
  }
  if (kind.endsWith(".started") || kind.endsWith(".created") || kind.endsWith(".updated")) {
    return "active";
  }
  return "neutral";
}

function runPhase(status: RunDashboardProjection["status"]): EntityPhase {
  if (status === "failed") return "failed";
  if (status === "completed" || status === "drained") return "completed";
  if (status === "running") return "running";
  return "pending";
}

function compareCards(a: RunWorkstreamCard, b: RunWorkstreamCard): number {
  const byAttention = Number(b.attention) - Number(a.attention);
  if (byAttention !== 0) return byAttention;
  const byUpdated = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  if (byUpdated !== 0) return byUpdated;
  return a.id.localeCompare(b.id);
}

function compareEventsDesc(a: RunEvent, b: RunEvent): number {
  const bySeq = (b.checkpointSeq ?? 0) - (a.checkpointSeq ?? 0);
  if (bySeq !== 0) return bySeq;
  return b.timestamp.localeCompare(a.timestamp);
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

function detail(
  label: string,
  value: string | number | undefined,
  href?: string,
): RunWorkstreamDetail[] {
  if (value === undefined) return [];
  const normalized = String(value);
  if (normalized.trim().length === 0) return [];
  return [{ label, value: normalized, ...(href !== undefined ? { href } : {}) }];
}

function compact(values: Array<string | undefined>): string[] {
  return unique(values.filter((value): value is string => Boolean(value && value.trim())));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function latest(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.localeCompare(b) > 0 ? a : b;
}

function mergeDetails(
  previous: RunWorkstreamDetail[],
  next: RunWorkstreamDetail[],
): RunWorkstreamDetail[] {
  const seen = new Set<string>();
  const merged: RunWorkstreamDetail[] = [];
  for (const item of [...next, ...previous]) {
    const key = `${item.label}:${item.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(0, 12);
}

function dedupeAttention(
  items: RunWorkstreamAttentionItem[],
): RunWorkstreamAttentionItem[] {
  const seen = new Set<string>();
  const out: RunWorkstreamAttentionItem[] = [];
  for (const item of items) {
    const key = item.itemId ?? item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
