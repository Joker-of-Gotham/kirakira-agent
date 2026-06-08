import type { OrchestratorKernel } from "@kirakira/orchestrator-kernel/daemon-orchestrator";
import type { RunStateSnapshot } from "@kirakira/runtime-contracts";

export type {
  ApprovalSummary,
  CostInfo,
  RunStateSnapshot,
  RuntimeWorkerSummary,
  TaskGraphSummary,
} from "@kirakira/runtime-contracts";

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
