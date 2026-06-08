import { ulid } from "ulid";
import { GraphCycleError, GraphValidationError } from "../errors.js";
import { normalizeSubagentTaskContract } from "../subagent/contract.js";
import type { PlanStep, RunPlan, TaskEdge, TaskGraph, TaskNode } from "../types.js";

interface JoinNode {
  id: string;
  description: string;
  memberIds: string[];
}

export class PlanNormalizer {
  normalize(plan: RunPlan, runId: string): TaskGraph {
    const now = new Date().toISOString();
    const graphId = ulid();
    const { planSteps, joinNodes, cohortJoinIdForStep } = PlanNormalizer.insertJoinNodes(plan.steps);
    const rootId = ulid();
    const nodes = new Map<string, TaskNode>();
    nodes.set(rootId, {
      id: rootId,
      kind: "plan",
      spec: {
        description: plan.goal,
        toolScope: [...plan.context.availableTools],
        skillScope: [...plan.context.availableSkills],
      },
      status: "pending",
    });
    for (const j of joinNodes) {
      nodes.set(j.id, {
        id: j.id,
        kind: "merge",
        spec: { description: j.description },
        status: "pending",
      });
    }
    for (const step of planSteps) {
      const subagent = normalizeSubagentTaskContract(step, plan.context);
      nodes.set(step.id, {
        id: step.id,
        kind: step.kind,
        spec: {
          description: step.description,
          ...(step.model !== undefined ? { model: step.model } : {}),
          ...(step.toolScope !== undefined ? { toolScope: [...step.toolScope] } : {}),
          ...(step.skillScope !== undefined ? { skillScope: [...step.skillScope] } : {}),
          ...(step.mcpServers !== undefined ? { mcpServers: [...step.mcpServers] } : {}),
          ...(step.inputArtifactRefs !== undefined
            ? { inputArtifactRefs: [...step.inputArtifactRefs] }
            : {}),
          ...(step.estimatedTokens !== undefined ? { estimatedTokens: step.estimatedTokens } : {}),
          ...(step.approvalRequired !== undefined ? { approvalRequired: step.approvalRequired } : {}),
          ...(subagent !== undefined ? { subagent } : {}),
        },
        status: "pending",
      });
    }
    const edges: TaskEdge[] = [];
    const memberIds = new Set(joinNodes.flatMap((j) => j.memberIds));
    const joinIdForMember = new Map<string, string>();
    for (const j of joinNodes) for (const m of j.memberIds) joinIdForMember.set(m, j.id);
    const parallelNeighborIds = (stepId: string): string[] => {
      const jid = joinIdForMember.get(stepId);
      if (!jid) return [];
      const j = joinNodes.find((x) => x.id === jid);
      return j ? [...j.memberIds] : [];
    };
    for (const step of planSteps) {
      if (memberIds.has(step.id)) {
        const jid = joinIdForMember.get(step.id);
        if (!jid) throw new GraphValidationError(`Internal: join missing for member ${step.id}`);
        edges.push({ from: step.id, to: jid, kind: "join" });
      }
      const deps = step.dependsOn;
      if (deps.length === 0) {
        edges.push({ from: rootId, to: step.id, kind: "depends_on" });
        continue;
      }
      const peers = parallelNeighborIds(step.id);
      const cohortId = cohortJoinIdForStep.get(step.id);
      const useFanout =
        cohortId !== undefined &&
        peers.length > 1 &&
        peers.filter((p) => cohortJoinIdForStep.get(p) === cohortId).length > 1;
      for (const d of deps) {
        if (!nodes.has(d)) throw new GraphValidationError(`Unknown dependency "${d}"`);
        edges.push({
          from: d,
          to: step.id,
          kind: useFanout ? "fanout" : "depends_on",
        });
      }
    }
    for (const step of planSteps) {
      if (step.approvalRequired) {
        edges.push({
          from: step.id,
          to: step.id,
          kind: "blocks_on_approval",
          metadata: { self: true },
        });
      }
    }
    const graph: TaskGraph = {
      id: graphId,
      runId,
      nodes,
      edges,
      rootNodeId: rootId,
      createdAt: now,
      updatedAt: now,
    };
    PlanNormalizer.assertAllNodesReachable(graph);
    if (PlanNormalizer.findCycle(graph)) {
      throw new GraphCycleError("Task graph contains a cycle");
    }
    return graph;
  }

  private static assertAllNodesReachable(g: TaskGraph): void {
    const seen = new Set<string>();
    const stack = [g.rootNodeId];
    const adj = new Map<string, string[]>();
    for (const n of g.nodes.keys()) adj.set(n, []);
    for (const e of g.edges) {
      if (e.kind === "supersedes") continue;
      if (e.kind === "blocks_on_approval" && e.from === e.to) continue;
      adj.get(e.from)?.push(e.to);
    }
    while (stack.length) {
      const u = stack.pop();
      if (u === undefined) break;
      if (seen.has(u)) continue;
      seen.add(u);
      for (const v of adj.get(u) ?? []) stack.push(v);
    }
    for (const id of g.nodes.keys()) {
      if (!seen.has(id)) throw new GraphValidationError(`Unreachable node in graph: ${id}`);
    }
  }

  private static insertJoinNodes(steps: PlanStep[]): {
    planSteps: PlanStep[];
    joinNodes: JoinNode[];
    cohortJoinIdForStep: Map<string, string>;
  } {
    const mutable = steps.map((s) => ({
      ...s,
      dependsOn: [...s.dependsOn],
    }));
    function sdependsOn(s: PlanStep): string[] {
      return [...s.dependsOn].sort();
    }
    const byKey = new Map<string, PlanStep[]>();
    for (const s of mutable) {
      const k = sdependsOn(s).join("\u001f");
      const list = byKey.get(k);
      if (list) list.push(s);
      else byKey.set(k, [s]);
    }
    const joinNodes: JoinNode[] = [];
    const cohortJoinIdForStep = new Map<string, string>();
    for (const group of byKey.values()) {
      const parallel = group.filter((st) => st.canParallelize);
      if (parallel.length <= 1) continue;
      const joinId = ulid();
      joinNodes.push({
        id: joinId,
        description: `Join ${parallel.length} parallel tasks`,
        memberIds: parallel.map((p) => p.id),
      });
      for (const p of parallel) cohortJoinIdForStep.set(p.id, joinId);
      const memberSet = new Set(parallel.map((p) => p.id));
      for (const node of mutable) {
        if (!node.dependsOn.some((d) => memberSet.has(d))) continue;
        const next = new Set(node.dependsOn);
        for (const m of memberSet) next.delete(m);
        next.add(joinId);
        node.dependsOn = [...next];
      }
    }
    return { planSteps: mutable, joinNodes, cohortJoinIdForStep };
  }

  private static findCycle(g: TaskGraph): boolean {
    const adj = new Map<string, string[]>();
    for (const n of g.nodes.keys()) adj.set(n, []);
    for (const e of g.edges) {
      if (e.kind === "supersedes") continue;
      if (e.kind === "blocks_on_approval" && e.from === e.to) continue;
      adj.get(e.from)?.push(e.to);
    }
    const state = new Map<string, 0 | 1 | 2>();
    for (const n of g.nodes.keys()) state.set(n, 0);
    const dfs = (u: string): boolean => {
      state.set(u, 1);
      for (const v of adj.get(u) ?? []) {
        const st = state.get(v) ?? 0;
        if (st === 1) return true;
        if (st === 0 && dfs(v)) return true;
      }
      state.set(u, 2);
      return false;
    };
    for (const nodeId of g.nodes.keys()) {
      if ((state.get(nodeId) ?? 0) === 0 && dfs(nodeId)) return true;
    }
    return false;
  }
}
