import type {
  RuntimeMcpDirectoryInputField,
  RuntimeMcpDirectoryTool,
} from "./mcp-directory.js";
import type {
  RuntimeMcpMetadataRow,
  RuntimeMcpToolPlaygroundView,
} from "./mcp-playground.js";
import type {
  RunInspectorDetail,
  RunInspectorFocus,
  RunInspectorProjection,
} from "./inspector.js";
import type {
  RunWorkstreamActivity,
  RunWorkstreamDetail,
  RunWorkstreamDetailDrawer,
  RunWorkstreamProjection,
  RunWorkstreamTone,
} from "./workstream.js";

export interface RunActivityRailMetric {
  id: "active" | "blocked" | "attention" | "done";
  label: string;
  value: string;
  tone: RunWorkstreamTone;
}

export interface RunActivityRailDetail {
  label: string;
  value: string;
  href?: string;
}

export interface RunActivityRailSelection {
  id: string;
  title: string;
  kind: string;
  tone: RunWorkstreamTone;
  summary: string;
  updatedAt?: string;
  details: RunActivityRailDetail[];
  relatedEventCount: number;
}

export interface RunActivityRailMcpTool {
  id: string;
  server: string;
  name: string;
  title: string;
  description?: string;
  inputSummary: string;
  inputFields: RuntimeMcpDirectoryInputField[];
  trustRows: RuntimeMcpMetadataRow[];
  policyRows: RuntimeMcpMetadataRow[];
  auditRows: RuntimeMcpMetadataRow[];
  schemaText: string;
  draftStatus: RuntimeMcpToolPlaygroundView["draft"]["status"];
  draftError?: string;
}

export interface RunActivityRailView {
  empty: boolean;
  metrics: RunActivityRailMetric[];
  selected?: RunActivityRailSelection;
  subagent?: RunActivityRailSelection;
  activity: RunWorkstreamActivity[];
  mcpTool?: RunActivityRailMcpTool;
}

export interface RunActivityRailOptions {
  workstream: RunWorkstreamProjection;
  inspector: RunInspectorProjection;
  mcpPlayground?: RuntimeMcpToolPlaygroundView;
  maxActivityItems?: number;
}

const DEFAULT_ACTIVITY_LIMIT = 5;

export function createRunActivityRailView({
  workstream,
  inspector,
  mcpPlayground,
  maxActivityItems = DEFAULT_ACTIVITY_LIMIT,
}: RunActivityRailOptions): RunActivityRailView {
  const selected = workstream.detail
    ? selectionFromWorkstream(workstream.detail)
    : inspector.empty
      ? undefined
      : selectionFromFocus(inspector.selectedFocus);
  const subagentFocus =
    inspector.selectedFocus?.kind === "subagent"
      ? inspector.selectedFocus
      : inspector.focusItems.find((item) => item.kind === "subagent");
  const subagent = selectionFromFocus(subagentFocus);
  const activity = workstream.activity.slice(0, Math.max(0, maxActivityItems));
  const mcpTool = mcpToolFromPlayground(mcpPlayground);

  return {
    empty:
      workstream.summary.totalCards === 0 &&
      activity.length === 0 &&
      selected === undefined &&
      mcpTool === undefined,
    metrics: [
      metric("active", "Active", workstream.summary.activeCards, "active"),
      metric(
        "blocked",
        "Blocked",
        workstream.summary.blockedCards,
        workstream.summary.blockedCards > 0 ? "critical" : "neutral",
      ),
      metric(
        "attention",
        "Attention",
        workstream.summary.attentionCount,
        workstream.summary.attentionCount > 0 ? "warning" : "neutral",
      ),
      metric("done", "Done", workstream.summary.doneCards, "success"),
    ],
    ...(selected ? { selected } : {}),
    ...(subagent ? { subagent } : {}),
    activity,
    ...(mcpTool ? { mcpTool } : {}),
  };
}

function metric(
  id: RunActivityRailMetric["id"],
  label: string,
  value: number,
  tone: RunWorkstreamTone,
): RunActivityRailMetric {
  return {
    id,
    label,
    value: String(value),
    tone,
  };
}

function selectionFromWorkstream(
  detail: RunWorkstreamDetailDrawer,
): RunActivityRailSelection {
  return {
    id: detail.id,
    title: detail.title,
    kind: detail.kind,
    tone: detail.tone,
    summary: detail.summary,
    ...(detail.updatedAt ? { updatedAt: detail.updatedAt } : {}),
    details: detail.details.slice(0, 5).map(normalizeDetail),
    relatedEventCount: detail.relatedEventIds.length,
  };
}

function selectionFromFocus(
  focus: RunInspectorFocus | undefined,
): RunActivityRailSelection | undefined {
  if (!focus) return undefined;
  return {
    id: focus.id,
    title: focus.label,
    kind: focus.kind,
    tone: toneForFocus(focus),
    summary: focus.summary,
    ...(focus.updatedAt ? { updatedAt: focus.updatedAt } : {}),
    details: focus.details.slice(0, 5).map(normalizeInspectorDetail),
    relatedEventCount: 0,
  };
}

function toneForFocus(focus: RunInspectorFocus): RunWorkstreamTone {
  if (focus.phase === "failed") return "critical";
  if (focus.phase === "completed" || focus.phase === "resolved") return "success";
  if (focus.phase === "requested" || focus.phase === "pending") return "warning";
  if (focus.phase === "running" || focus.phase === "ready" || focus.phase === "updated") {
    return "active";
  }
  return "neutral";
}

function normalizeDetail(detail: RunWorkstreamDetail): RunActivityRailDetail {
  return {
    label: detail.label,
    value: detail.value,
    ...(detail.href ? { href: detail.href } : {}),
  };
}

function normalizeInspectorDetail(detail: RunInspectorDetail): RunActivityRailDetail {
  return {
    label: detail.label,
    value: detail.value,
    ...(detail.href ? { href: detail.href } : {}),
  };
}

function mcpToolFromPlayground(
  playground: RuntimeMcpToolPlaygroundView | undefined,
): RunActivityRailMcpTool | undefined {
  const tool = playground?.tool;
  if (!tool) return undefined;
  return {
    id: tool.id,
    server: tool.server,
    name: tool.name,
    title: tool.title,
    ...(tool.description ? { description: tool.description } : {}),
    inputSummary: inputSummary(tool),
    inputFields: playground.fields,
    trustRows: playground.trustRows,
    policyRows: playground.policyRows,
    auditRows: playground.auditRows,
    schemaText: JSON.stringify(tool.inputSchema ?? { type: "object" }, null, 2),
    draftStatus: playground.draft.status,
    ...(playground.draft.error ? { draftError: playground.draft.error } : {}),
  };
}

function inputSummary(tool: RuntimeMcpDirectoryTool): string {
  if (tool.inputPropertyCount === 0) return "No declared inputs";
  return `${tool.inputPropertyCount} fields, ${tool.requiredInputCount} required`;
}
