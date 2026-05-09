import { GraphValidationError } from "../errors.js";
import type { TaskEdge, TaskGraph, TaskNode, TaskResult } from "../types.js";

const BLOCKING = new Set<TaskEdge["kind"]>([
  "depends_on",
  "fanout",
  "join",
  "artifact_flow",
]);

export class DependencyResolver {
  resolve(graph: TaskGraph): TaskGraph {
    const next = DependencyResolver.cloneGraph(graph);
    next.updatedAt = new Date().toISOString();
    for (const node of next.nodes.values()) {
      if (
        node.status === "running" ||
        node.status === "completed" ||
        node.status === "failed" ||
        node.status === "interrupted" ||
        node.status === "cancelled"
      ) {
        continue;
      }
      if (DependencyResolver.isSuperseded(next, node.id)) {
        node.status = "cancelled";
        continue;
      }
      if (!DependencyResolver.approvalSatisfied(next, node)) {
        node.status = "pending";
        continue;
      }
      if (DependencyResolver.allBlockingComplete(next, node.id)) {
        node.status = "ready";
      } else {
        node.status = "pending";
      }
    }
    return next;
  }

  getReadyNodes(graph: TaskGraph): TaskNode[] {
    return [...graph.nodes.values()].filter((n) => n.status === "ready");
  }

  markRunning(graph: TaskGraph, nodeId: string, workerId: string): TaskGraph {
    const next = DependencyResolver.cloneGraph(graph);
    const node = next.nodes.get(nodeId);
    if (!node) throw new GraphValidationError(`Unknown node ${nodeId}`);
    if (node.status !== "ready") {
      throw new GraphValidationError(`Node ${nodeId} not ready for execution (status=${node.status})`);
    }
    const now = new Date().toISOString();
    next.nodes.set(nodeId, {
      ...node,
      status: "running",
      startedAt: now,
      assignedWorkerId: workerId,
    });
    next.updatedAt = now;
    return next;
  }

  markFailed(graph: TaskGraph, nodeId: string, message: string): TaskGraph {
    const next = DependencyResolver.cloneGraph(graph);
    const node = next.nodes.get(nodeId);
    if (!node) throw new GraphValidationError(`Unknown node ${nodeId}`);
    const now = new Date().toISOString();
    next.nodes.set(nodeId, {
      ...node,
      status: "failed",
      error: message,
      completedAt: now,
    });
    next.updatedAt = now;
    return this.resolve(next);
  }

  markCompleted(graph: TaskGraph, nodeId: string, result: TaskResult): TaskGraph {
    const next = DependencyResolver.cloneGraph(graph);
    const node = next.nodes.get(nodeId);
    if (!node) throw new GraphValidationError(`Unknown node ${nodeId}`);
    const now = new Date().toISOString();
    const updated: TaskNode = {
      ...node,
      status: "completed",
      result,
      completedAt: now,
      ...(result.artifactRefs?.length ? { artifactRefs: result.artifactRefs } : {}),
    };
    next.nodes.set(nodeId, updated);
    next.updatedAt = now;
    const withArtifacts = DependencyResolver.bindArtifactFlows(next, nodeId, result);
    return this.resolve(withArtifacts);
  }

  checkJoinBarriers(graph: TaskGraph): string[] {
    const joinTargets = new Map<string, string[]>();
    for (const e of graph.edges) {
      if (e.kind !== "join") continue;
      const list = joinTargets.get(e.to);
      if (list) list.push(e.from);
      else joinTargets.set(e.to, [e.from]);
    }
    const readyJoins: string[] = [];
    for (const [joinId, sources] of joinTargets) {
      const jn = graph.nodes.get(joinId);
      if (!jn || jn.status === "completed") continue;
      const allDone = sources.every((s) => graph.nodes.get(s)?.status === "completed");
      if (allDone) readyJoins.push(joinId);
    }
    return readyJoins;
  }

  private static bindArtifactFlows(
    graph: TaskGraph,
    producerId: string,
    result: TaskResult,
  ): TaskGraph {
    const refs = result.artifactRefs;
    if (!refs?.length) return graph;
    const next = DependencyResolver.cloneGraph(graph);
    for (const e of next.edges) {
      if (e.kind !== "artifact_flow" || e.from !== producerId) continue;
      const child = next.nodes.get(e.to);
      if (!child) continue;
      const prev = (child.spec.inputArtifactRefs as string[] | undefined) ?? [];
      const merged = [...new Set([...prev, ...refs])];
      next.nodes.set(e.to, {
        ...child,
        spec: { ...child.spec, inputArtifactRefs: merged },
      });
    }
    return next;
  }

  private static approvalSatisfied(graph: TaskGraph, node: TaskNode): boolean {
    const selfBlock = graph.edges.some(
      (e) => e.kind === "blocks_on_approval" && e.from === node.id && e.to === node.id,
    );
    if (!selfBlock) return true;
    return Boolean(node.spec.approvalCleared);
  }

  private static allBlockingComplete(graph: TaskGraph, nodeId: string): boolean {
    const preds = DependencyResolver.predecessors(graph, nodeId);
    for (const p of preds) {
      const st = graph.nodes.get(p)?.status;
      if (st !== "completed") return false;
    }
    return true;
  }

  private static predecessors(graph: TaskGraph, nodeId: string): string[] {
    const out: string[] = [];
    for (const e of graph.edges) {
      if (e.to !== nodeId) continue;
      if (!BLOCKING.has(e.kind)) continue;
      if (e.kind === "blocks_on_approval" && e.from === e.to) continue;
      out.push(e.from);
    }
    return out;
  }

  private static isSuperseded(graph: TaskGraph, nodeId: string): boolean {
    return graph.edges.some((e) => e.kind === "supersedes" && e.to === nodeId);
  }

  private static cloneGraph(graph: TaskGraph): TaskGraph {
    return {
      ...graph,
      nodes: new Map([...graph.nodes.entries()].map(([k, v]) => [k, { ...v }])),
      edges: graph.edges.map((e) => ({ ...e })),
    };
  }
}
