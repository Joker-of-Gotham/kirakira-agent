import type { PreflightResult, TaskGraph } from "../types.js";

export interface PreflightConfig {
  /** Average expected response time per approval gate, in ms. Default 30_000 (30s). */
  avgApprovalDelayMs?: number;
}

export class PolicyPreflight {
  private readonly avgApprovalDelayMs: number;

  constructor(config?: PreflightConfig) {
    this.avgApprovalDelayMs = config?.avgApprovalDelayMs ?? 30_000;
  }

  evaluate(graph: TaskGraph): PreflightResult {
    const approvalsRequired: PreflightResult["approvalsRequired"] = [];

    for (const node of graph.nodes.values()) {
      if (node.kind === "approval" || node.spec.approvalRequired) {
        approvalsRequired.push({
          nodeId: node.id,
          reason: "task requires explicit approval",
          edgeKinds: [],
        });
      }
    }

    for (const e of graph.edges) {
      if (e.kind === "blocks_on_approval") {
        const alreadyListed = approvalsRequired.some((a) => a.nodeId === e.to);
        if (!alreadyListed) {
          approvalsRequired.push({
            nodeId: e.to,
            reason: "blocks_on_approval edge",
            edgeKinds: [e.kind],
          });
        }
      }
    }

    const criticalPathCount = this.countCriticalPathApprovals(graph, approvalsRequired);
    const estimatedDelayMs = criticalPathCount * this.avgApprovalDelayMs;
    return { approvalsRequired, estimatedDelayMs };
  }

  /**
   * Count approvals on the critical path (sequential chain).
   * Parallel approvals don't compound delay — only the longest path matters.
   */
  private countCriticalPathApprovals(
    graph: TaskGraph,
    approvals: PreflightResult["approvalsRequired"],
  ): number {
    const approvalNodeIds = new Set(approvals.map((a) => a.nodeId));
    const depths = new Map<string, number>();
    const maxDepth = (nodeId: string, visited: Set<string>): number => {
      if (visited.has(nodeId)) return 0;
      if (depths.has(nodeId)) return depths.get(nodeId)!;
      visited.add(nodeId);
      const outgoing = graph.edges.filter((e) => e.from === nodeId);
      let best = 0;
      for (const e of outgoing) {
        const childDepth = maxDepth(e.to, visited);
        const add = approvalNodeIds.has(e.to) ? 1 : 0;
        best = Math.max(best, childDepth + add);
      }
      depths.set(nodeId, best);
      return best;
    };
    const rootAdd = approvalNodeIds.has(graph.rootNodeId) ? 1 : 0;
    return maxDepth(graph.rootNodeId, new Set()) + rootAdd;
  }
}
