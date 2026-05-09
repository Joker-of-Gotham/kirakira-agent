import type { WorkerSummary } from "@kirakira/agent-runtime";
import type { OrchestratorKernel } from "@kirakira/orchestrator-kernel/daemon-orchestrator";

export interface TaskGraphSummary {
  totalNodes: number;
  completedNodes: number;
  runningNodes: number;
  failedNodes: number;
}

export interface ApprovalSummary {
  ticketId: string;
  action: string;
  reason: string;
  requestedAt: string;
}

export interface CostInfo {
  totalCostUsd: number;
  totalTokens: number;
  budgetRemainingUsd?: number;
}

export interface RunStateSnapshot {
  runId: string;
  status: string;
  graph?: TaskGraphSummary;
  activeWorkers: WorkerSummary[];
  pendingApprovals: ApprovalSummary[];
  costSummary: CostInfo;
  checkpointId?: string;
}

export function buildRunStateSnapshot(
  kernel: OrchestratorKernel,
  runId: string,
): RunStateSnapshot | null {
  const { run, workers, approvals } = kernel.snapshotRunForDaemon(runId);
  if (!run) return null;
  return {
    runId: run.runId,
    status: run.status,
    graph: { ...run.graph },
    activeWorkers: workers,
    pendingApprovals: approvals.map((a) => ({
      ticketId: a.ticketId,
      action: a.action,
      reason: a.reason,
      requestedAt: a.requestedAt,
    })),
    costSummary: {
      totalCostUsd: run.cost.totalCostUsd,
      totalTokens: run.cost.totalTokens,
      budgetRemainingUsd: run.cost.budgetRemainingUsd,
    },
    checkpointId: run.checkpointId,
  };
}
