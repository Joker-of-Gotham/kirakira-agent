export interface RuntimeWorkerSummary {
  id: string;
  workloadType: string;
  status: string;
  turnCount: number;
  model?: string;
}

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
  activeWorkers: RuntimeWorkerSummary[];
  pendingApprovals: ApprovalSummary[];
  costSummary: CostInfo;
  checkpointId?: string;
}
