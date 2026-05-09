import type {
  GraphAdapter,
  GraphNodeLabel,
  MemoryRecord,
  RecallRoute,
  RecallRouteInput,
  RecallRouteResult,
  StoreAdapter,
} from "@kirakira/memory-core";
import type { RouteExplanation } from "@kirakira/memory-core";

function centralEntityIds(query: string): string[] {
  return [...query.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi)].map(
    (m) => m[0]!,
  );
}

export class GraphRecallRoute implements RecallRoute {
  readonly name = "graph";
  constructor(
    readonly weight: number,
    private readonly graph: GraphAdapter,
    private readonly store: StoreAdapter,
  ) {}

  async execute(input: RecallRouteInput): Promise<RecallRouteResult> {
    const start = performance.now();
    const starts = [...new Set([...input.entityIds, ...centralEntityIds(input.query)])];
    const filters: Record<string, unknown> = { starts, depth: 2 };

    if (starts.length === 0) {
      return {
        records: [],
        explanation: {
          routeName: this.name,
          candidates: [],
          filters,
          durationMs: performance.now() - start,
        },
      };
    }

    const traversal = await this.graph.traverse({
      startNodeIds: starts,
      edgeTypes: undefined,
      maxDepth: 2,
      timeWindow: input.timeWindow,
      limit: input.limit * 3,
    });

    const ids = new Set<string>();
    const nodeIdToRecordId = new Map<string, string>();
    const labelsWanted: Set<GraphNodeLabel> = new Set(["Fact", "Observation", "Episode", "Entity"]);
    for (const n of traversal.nodes) {
      if (labelsWanted.has(n.label) && typeof n.props["sourceRecordId"] === "string") {
        ids.add(n.props["sourceRecordId"] as string);
        nodeIdToRecordId.set(n.id, n.props["sourceRecordId"] as string);
      }
      if (typeof n.props["id"] === "string" && (n.label === "Fact" || n.label === "Episode")) {
        ids.add(n.props["id"] as string);
        nodeIdToRecordId.set(n.id, n.props["id"] as string);
      }
    }

    const recordGraphPaths = new Map<string, string[]>();
    for (const p of (traversal.paths ?? [])) {
      const pathLabels = p.nodeIds
        .map((nid) => traversal.nodes.find((n) => n.id === nid))
        .filter(Boolean)
        .map((n) => `${n!.label}:${n!.id}`);
      for (const nid of p.nodeIds) {
        const recId = nodeIdToRecordId.get(nid);
        if (recId && !recordGraphPaths.has(recId)) {
          recordGraphPaths.set(recId, pathLabels);
        }
      }
    }

    const records: Array<{ record: MemoryRecord; score: number }> = [];
    let rank = 1;
    for (const id of ids) {
      const rec = await this.store.getRecord(id);
      if (rec && rec.tenantId === input.tenantId) {
        const gp = recordGraphPaths.get(id);
        if (gp) rec.metadata["_graphPath"] = gp;
        records.push({ record: rec, score: 1 / rank });
        rank += 1;
      }
      if (records.length >= input.limit) break;
    }

    const explanation: RouteExplanation = {
      routeName: this.name,
      candidates: records.map((r, i) => ({
        recordId: r.record.id,
        score: r.score,
        rank: i + 1,
      })),
      filters,
      durationMs: performance.now() - start,
    };

    return { records, explanation };
  }
}
