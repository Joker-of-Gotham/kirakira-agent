import type {
  RuntimeCapabilityRecord,
} from "@kirakira/runtime-contracts";
import type {
  RuntimeMcpDirectoryServer,
  RuntimeMcpDirectoryTool,
  RuntimeMcpDirectoryView,
  RuntimeMcpHealthTone,
} from "./mcp-directory.js";
import type {
  EntityPhase,
  RunDashboardArtifact,
  RunDashboardProjection,
  RunDashboardResearchRun,
} from "./projection.js";
import {
  runtimeTransportManifest,
  runtimeTransportSupportsArtifactContent,
} from "./runtime-capabilities.js";
import type { RuntimeTransportStatus } from "./transport.js";

export type WorkbenchInspectorViewId = "memory" | "research" | "mcp" | "artifacts";
export type WorkbenchInspectorTone = "neutral" | "active" | "success" | "warning" | "danger";

export interface WorkbenchInspectorMetric {
  label: string;
  value: string;
  tone: WorkbenchInspectorTone;
}

export interface WorkbenchInspectorTab {
  id: WorkbenchInspectorViewId;
  label: string;
  count: number;
  tone: WorkbenchInspectorTone;
}

export interface WorkbenchInspectorRow {
  id: string;
  title: string;
  detail?: string;
  meta?: string;
  tone: WorkbenchInspectorTone;
  href?: string;
  focusId?: string;
}

export interface WorkbenchInspectorMcpTool {
  id: string;
  title: string;
  detail: string;
  tone: WorkbenchInspectorTone;
  selected: boolean;
}

export interface WorkbenchInspectorMcpServer {
  name: string;
  health: string;
  tone: WorkbenchInspectorTone;
  toolCount: number;
  discoveredToolCount: number;
  selected: boolean;
  error?: string;
  tools: WorkbenchInspectorMcpTool[];
}

export interface WorkbenchInspectorPanel {
  id: WorkbenchInspectorViewId;
  kicker: string;
  title: string;
  summary: string;
  statusLabel: string;
  statusTone: WorkbenchInspectorTone;
  metrics: WorkbenchInspectorMetric[];
  rows: WorkbenchInspectorRow[];
  emptyMessage?: string;
  errorMessage?: string;
  mcpServers?: WorkbenchInspectorMcpServer[];
}

export interface WorkbenchInspectorMcpState {
  status: "idle" | "loading" | "ready" | "error";
  message?: string;
}

export interface WorkbenchInspectorInput {
  projection: RunDashboardProjection;
  runtimeStatus?: RuntimeTransportStatus;
  mcpDirectory: RuntimeMcpDirectoryView;
  mcpState?: WorkbenchInspectorMcpState;
  activeView?: WorkbenchInspectorViewId;
  selectedMcpToolId?: string;
}

export interface WorkbenchInspectorView {
  activeView: WorkbenchInspectorViewId;
  tabs: WorkbenchInspectorTab[];
  panel: WorkbenchInspectorPanel;
}

const VIEW_LABELS: Record<WorkbenchInspectorViewId, string> = {
  memory: "Memory",
  research: "Research",
  mcp: "MCP",
  artifacts: "Artifacts",
};

const DEFAULT_MCP_STATE: WorkbenchInspectorMcpState = { status: "idle" };

export function createWorkbenchInspectorView({
  projection,
  runtimeStatus,
  mcpDirectory,
  mcpState = DEFAULT_MCP_STATE,
  activeView = "mcp",
  selectedMcpToolId,
}: WorkbenchInspectorInput): WorkbenchInspectorView {
  const panels: Record<WorkbenchInspectorViewId, WorkbenchInspectorPanel> = {
    memory: memoryPanel(runtimeStatus),
    research: researchPanel(projection),
    mcp: mcpPanel(mcpDirectory, mcpState, selectedMcpToolId),
    artifacts: artifactsPanel(projection, runtimeStatus),
  };

  return {
    activeView,
    tabs: (Object.keys(VIEW_LABELS) as WorkbenchInspectorViewId[]).map((id) => ({
      id,
      label: VIEW_LABELS[id],
      count: tabCount(id, panels[id], mcpDirectory),
      tone: panels[id].statusTone,
    })),
    panel: panels[activeView],
  };
}

function tabCount(
  id: WorkbenchInspectorViewId,
  panel: WorkbenchInspectorPanel,
  mcpDirectory: RuntimeMcpDirectoryView,
): number {
  if (id === "memory") return panel.statusLabel === "disabled" || panel.statusLabel === "unknown" ? 0 : 1;
  if (id === "mcp") return mcpDirectory.summary.toolCount;
  return panel.rows.length;
}

function memoryPanel(runtimeStatus: RuntimeTransportStatus | undefined): WorkbenchInspectorPanel {
  const manifest = runtimeTransportManifest(runtimeStatus);
  const capability = manifest?.capabilities.memory;
  const state = capability?.state ?? "unknown";
  const tone = capabilityTone(capability);
  const rows: WorkbenchInspectorRow[] = [
    runtimeStatus
      ? {
          id: "memory-runtime",
          title: runtimeStatus.label,
          detail: runtimeStatus.detail,
          meta: runtimeStatus.state,
          tone: runtimeStatus.state === "healthy" ? "success" : "warning",
        }
      : undefined,
    capability
      ? {
          id: "memory-capability",
          title: "Capability",
          detail: capability.summary,
          meta: capability.state,
          tone,
        }
      : undefined,
    listRow("memory-events", "Events", capability?.eventKinds),
    listRow("memory-client-messages", "Client messages", capability?.clientMessageTypes),
    limitsRow(capability),
  ].filter((row): row is WorkbenchInspectorRow => row !== undefined);

  return {
    id: "memory",
    kicker: "Memory",
    title: "Runtime Memory",
    summary: capability?.summary ?? "Waiting for runtime manifest capability metadata.",
    statusLabel: state,
    statusTone: tone,
    metrics: [
      metric("State", state, tone),
      metric("Events", String(capability?.eventKinds?.length ?? 0), "neutral"),
      metric("Client ops", String(capability?.clientMessageTypes?.length ?? 0), "neutral"),
    ],
    rows,
    ...(capability === undefined
      ? { emptyMessage: "Runtime manifest has not loaded memory capability metadata." }
      : {}),
    ...(capability?.state === "disabled"
      ? { errorMessage: "Memory capability is disabled by the current runtime profile." }
      : {}),
  };
}

function researchPanel(projection: RunDashboardProjection): WorkbenchInspectorPanel {
  const runs = Object.values(projection.researchRuns).sort(compareByUpdatedDesc);
  const failed = runs.find((run) => run.phase === "failed");
  const evidenceCount = runs.reduce((total, run) => total + run.evidenceCount, 0);
  const citationCount = runs.reduce((total, run) => total + run.citationCount, 0);
  const tone = aggregatePhaseTone(runs.map((run) => run.phase));

  return {
    id: "research",
    kicker: "Research",
    title: "Evidence Runs",
    summary:
      runs.length === 0
        ? "No research run events have been projected yet."
        : `${evidenceCount} evidence records across ${runs.length} research runs.`,
    statusLabel: runs.length === 0 ? "empty" : tone,
    statusTone: tone,
    metrics: [
      metric("Runs", String(runs.length), tone),
      metric("Evidence", String(evidenceCount), "neutral"),
      metric("Citations", String(citationCount), "neutral"),
    ],
    rows: runs.map(researchRow),
    ...(runs.length === 0 ? { emptyMessage: "No research evidence yet." } : {}),
    ...(failed ? { errorMessage: failed.error ?? "A research run failed." } : {}),
  };
}

function mcpPanel(
  view: RuntimeMcpDirectoryView,
  state: WorkbenchInspectorMcpState,
  selectedToolId: string | undefined,
): WorkbenchInspectorPanel {
  const statusTone = mcpStatusTone(view, state);
  const selectedServerName = selectedToolId?.split(":")[0];
  const servers = view.servers.map((server) =>
    mcpServer(server, selectedServerName, selectedToolId),
  );

  return {
    id: "mcp",
    kicker: "MCP",
    title: "Inventory",
    summary:
      view.summary.serverCount === 0
        ? "Discover runtime MCP servers through the shared transport contract."
        : `${view.summary.toolCount} tools across ${view.summary.serverCount} servers.`,
    statusLabel: state.status,
    statusTone,
    metrics: [
      metric("Servers", String(view.summary.serverCount), "neutral"),
      metric("Ready", String(view.summary.readyServerCount), "success"),
      metric("Attention", String(view.summary.attentionServerCount), view.summary.attentionServerCount > 0 ? "warning" : "neutral"),
    ],
    rows: servers.map((server) => ({
      id: `mcp-server:${server.name}`,
      title: server.name,
      detail: server.error ?? `${server.discoveredToolCount} discovered tools`,
      meta: server.health,
      tone: server.tone,
    })),
    ...(servers.length > 0 ? { mcpServers: servers } : {}),
    ...(state.status === "error"
      ? { errorMessage: state.message ?? "MCP discovery failed." }
      : {}),
    ...(state.status !== "error" && view.summary.serverCount === 0
      ? { emptyMessage: state.status === "loading" ? "Loading MCP inventory." : "No MCP servers discovered." }
      : {}),
  };
}

function artifactsPanel(
  projection: RunDashboardProjection,
  runtimeStatus: RuntimeTransportStatus | undefined,
): WorkbenchInspectorPanel {
  const artifacts = Object.values(projection.artifactDetails).sort(compareByUpdatedDesc);
  const capabilityKnown = runtimeStatus !== undefined;
  const previewAvailable = runtimeTransportSupportsArtifactContent(runtimeStatus);
  const statusLabel = !capabilityKnown
    ? "checking"
    : previewAvailable
      ? "preview enabled"
      : "preview unavailable";
  const statusTone: WorkbenchInspectorTone = !capabilityKnown
    ? "active"
    : previewAvailable
      ? "success"
      : "warning";
  const kinds = new Set(artifacts.map((artifact) => artifact.kind).filter(Boolean));

  return {
    id: "artifacts",
    kicker: "Artifacts",
    title: "Outputs",
    summary:
      artifacts.length === 0
        ? "No artifact events have been projected yet."
        : `${artifacts.length} artifacts are available from this run.`,
    statusLabel,
    statusTone,
    metrics: [
      metric("Artifacts", String(artifacts.length), artifacts.length > 0 ? "active" : "neutral"),
      metric("Kinds", String(kinds.size), "neutral"),
      metric("Preview", previewAvailable ? "on" : "off", statusTone),
    ],
    rows: artifacts.map(artifactRow),
    ...(artifacts.length === 0 ? { emptyMessage: "No artifacts yet." } : {}),
    ...(capabilityKnown && !previewAvailable
      ? { errorMessage: "Artifact content preview is not enabled by this runtime." }
      : {}),
  };
}

function researchRow(run: RunDashboardResearchRun): WorkbenchInspectorRow {
  const citation = run.latestCitation;
  return {
    id: `research:${run.id}`,
    focusId: `research:${run.id}`,
    title: run.question ?? run.id,
    detail: citation?.title ?? citation?.uri ?? `${run.evidenceCount} evidence records`,
    meta: `${run.phase} / ${run.citationCount} citations`,
    tone: phaseTone(run.phase),
    ...(citation?.uri ? { href: citation.uri } : {}),
  };
}

function artifactRow(artifact: RunDashboardArtifact): WorkbenchInspectorRow {
  return {
    id: `artifact:${artifact.id}`,
    focusId: `artifact:${artifact.id}`,
    title: artifact.title ?? artifact.path ?? artifact.id,
    detail: artifact.summary ?? artifact.path ?? artifact.kind,
    meta: artifact.kind ?? artifact.phase,
    tone: phaseTone(artifact.phase),
  };
}

function mcpServer(
  server: RuntimeMcpDirectoryServer,
  selectedServerName: string | undefined,
  selectedToolId: string | undefined,
): WorkbenchInspectorMcpServer {
  const selected = selectedServerName === server.name;
  return {
    name: server.name,
    health: server.health,
    tone: mcpHealthTone(server.tone),
    toolCount: server.toolCount,
    discoveredToolCount: server.discoveredToolCount,
    selected,
    ...(server.error ? { error: server.error } : {}),
    tools: server.tools.map((tool) => mcpTool(tool, selectedToolId)),
  };
}

function mcpTool(
  tool: RuntimeMcpDirectoryTool,
  selectedToolId: string | undefined,
): WorkbenchInspectorMcpTool {
  const selected = tool.id === selectedToolId;
  return {
    id: tool.id,
    title: tool.title,
    detail: `${tool.inputPropertyCount} fields / ${tool.requiredInputCount} required`,
    tone: selected ? "active" : "neutral",
    selected,
  };
}

function compareByUpdatedDesc<T extends { id: string; updatedAt?: string }>(a: T, b: T): number {
  const byUpdated = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  if (byUpdated !== 0) return byUpdated;
  return a.id.localeCompare(b.id);
}

function metric(
  label: string,
  value: string,
  tone: WorkbenchInspectorTone,
): WorkbenchInspectorMetric {
  return { label, value, tone };
}

function capabilityTone(
  capability: RuntimeCapabilityRecord | undefined,
): WorkbenchInspectorTone {
  if (!capability) return "warning";
  if (capability.state === "enabled") return "success";
  if (capability.state === "available") return "active";
  return "warning";
}

function phaseTone(phase: EntityPhase): WorkbenchInspectorTone {
  if (phase === "failed") return "danger";
  if (phase === "completed" || phase === "resolved") return "success";
  if (phase === "running" || phase === "created" || phase === "updated" || phase === "ready") {
    return "active";
  }
  if (phase === "pending" || phase === "requested") return "warning";
  return "neutral";
}

function aggregatePhaseTone(phases: EntityPhase[]): WorkbenchInspectorTone {
  if (phases.length === 0) return "neutral";
  if (phases.some((phase) => phase === "failed")) return "danger";
  if (phases.some((phase) => phase === "running" || phase === "requested")) return "active";
  if (phases.every((phase) => phase === "completed" || phase === "resolved")) return "success";
  return "warning";
}

function mcpStatusTone(
  view: RuntimeMcpDirectoryView,
  state: WorkbenchInspectorMcpState,
): WorkbenchInspectorTone {
  if (state.status === "error") return "danger";
  if (state.status === "loading") return "active";
  if (view.summary.attentionServerCount > 0) return "warning";
  if (view.summary.readyServerCount > 0) return "success";
  return "neutral";
}

function mcpHealthTone(tone: RuntimeMcpHealthTone): WorkbenchInspectorTone {
  if (tone === "ready") return "success";
  if (tone === "pending") return "active";
  if (tone === "warning") return "warning";
  if (tone === "failed") return "danger";
  return "neutral";
}

function listRow(
  id: string,
  title: string,
  values: readonly string[] | undefined,
): WorkbenchInspectorRow | undefined {
  if (!values || values.length === 0) return undefined;
  return {
    id,
    title,
    detail: values.slice(0, 4).join(", "),
    meta: `${values.length} declared`,
    tone: "neutral",
  };
}

function limitsRow(capability: RuntimeCapabilityRecord | undefined): WorkbenchInspectorRow | undefined {
  const limits = capability?.limits;
  if (!limits || Object.keys(limits).length === 0) return undefined;
  return {
    id: `${capability.id}-limits`,
    title: "Limits",
    detail: Object.entries(limits)
      .slice(0, 4)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", "),
    tone: "neutral",
  };
}
