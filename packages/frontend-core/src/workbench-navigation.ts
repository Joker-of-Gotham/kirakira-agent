import type { RuntimeMcpDirectoryView } from "./mcp-directory.js";
import type { RunDashboardProjection } from "./projection.js";
import type { RuntimeTransportStatus } from "./transport.js";
import { runtimeTransportManifest } from "./runtime-capabilities.js";

export type WorkbenchViewId = "runs" | "agents" | "research" | "systems";
export type WorkbenchViewTone = "neutral" | "active" | "success" | "warning" | "danger";

export interface WorkbenchNavigationItem {
  id: WorkbenchViewId;
  label: string;
  count: number;
  status: string;
  tone: WorkbenchViewTone;
  selected: boolean;
}

export interface WorkbenchNavigationView {
  activeView: WorkbenchViewId;
  items: WorkbenchNavigationItem[];
}

export interface WorkbenchNavigationInput {
  projection: RunDashboardProjection;
  mcpDirectory: RuntimeMcpDirectoryView;
  runtimeStatus?: RuntimeTransportStatus;
  pendingApprovalCount?: number;
  activeView?: WorkbenchViewId;
}

const VIEW_ORDER: WorkbenchViewId[] = ["runs", "agents", "research", "systems"];
const VIEW_LABELS: Record<WorkbenchViewId, string> = {
  runs: "Runs",
  agents: "Agents",
  research: "Research",
  systems: "Systems",
};

export function createWorkbenchNavigationView({
  projection,
  mcpDirectory,
  runtimeStatus,
  pendingApprovalCount = projection.pendingApprovalIds.length,
  activeView = "runs",
}: WorkbenchNavigationInput): WorkbenchNavigationView {
  const safeActiveView = VIEW_ORDER.includes(activeView) ? activeView : "runs";
  const items: WorkbenchNavigationItem[] = VIEW_ORDER.map((id) => {
    const summary = summaryForView(id, projection, mcpDirectory, runtimeStatus, pendingApprovalCount);
    return {
      id,
      label: VIEW_LABELS[id],
      selected: id === safeActiveView,
      ...summary,
    };
  });

  return {
    activeView: safeActiveView,
    items,
  };
}

function summaryForView(
  id: WorkbenchViewId,
  projection: RunDashboardProjection,
  mcpDirectory: RuntimeMcpDirectoryView,
  runtimeStatus: RuntimeTransportStatus | undefined,
  pendingApprovalCount: number,
): Pick<WorkbenchNavigationItem, "count" | "status" | "tone"> {
  if (id === "runs") {
    const activeCount = countPhases(projection.entities.tasks, ["running", "requested", "ready"]);
    if (pendingApprovalCount > 0) {
      return { count: pendingApprovalCount, status: "approval", tone: "warning" };
    }
    if (projection.status === "failed") {
      return { count: activeCount, status: "failed", tone: "danger" };
    }
    if (projection.status === "completed") {
      return { count: activeCount, status: "complete", tone: "success" };
    }
    return {
      count: activeCount,
      status: projection.status,
      tone: activeCount > 0 ? "active" : "neutral",
    };
  }

  if (id === "agents") {
    const activeWorkers = countPhases(projection.entities.subagents, ["running", "requested", "ready"]);
    const failedWorkers = countPhases(projection.entities.subagents, ["failed"]);
    if (failedWorkers > 0) return { count: failedWorkers, status: "attention", tone: "danger" };
    return {
      count: activeWorkers,
      status: activeWorkers > 0 ? "active" : "idle",
      tone: activeWorkers > 0 ? "active" : "neutral",
    };
  }

  if (id === "research") {
    const runs = Object.values(projection.researchRuns);
    const failedRuns = runs.filter((run) => run.phase === "failed").length;
    const runningRuns = runs.filter((run) => run.phase === "running").length;
    if (failedRuns > 0) return { count: failedRuns, status: "blocked", tone: "danger" };
    if (runningRuns > 0) return { count: runningRuns, status: "collecting", tone: "active" };
    return {
      count: runs.length,
      status: runs.length > 0 ? "ready" : "empty",
      tone: runs.length > 0 ? "success" : "neutral",
    };
  }

  const manifest = runtimeTransportManifest(runtimeStatus);
  const memoryState = manifest?.capabilities.memory?.state;
  const artifactState = manifest?.capabilities.artifacts?.state;
  const attentionCount = mcpDirectory.summary.attentionServerCount;
  if (attentionCount > 0 || memoryState === "disabled" || artifactState === "disabled") {
    return { count: attentionCount, status: "attention", tone: "warning" };
  }
  if (runtimeStatus?.state === "unavailable") {
    return { count: 0, status: "offline", tone: "danger" };
  }
  return {
    count: mcpDirectory.summary.toolCount,
    status: mcpDirectory.summary.toolCount > 0 ? "ready" : "scanning",
    tone: mcpDirectory.summary.toolCount > 0 ? "success" : "neutral",
  };
}

function countPhases(
  phases: Record<string, string>,
  selectedPhases: string[],
): number {
  const selected = new Set(selectedPhases);
  return Object.values(phases).filter((phase) => selected.has(phase)).length;
}
