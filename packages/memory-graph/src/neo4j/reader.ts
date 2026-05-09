import neo4j from "neo4j-driver";
import type { Relationship, Session } from "neo4j-driver";
import type { GraphEdge, GraphEdgeType, GraphNode, GraphNodeLabel, GraphSearchResult, TraversalParams } from "@kirakira/memory-core";
import { neoNodeToGraphNode, neoPathToGraphPath, nodeIdFromNeoNode, rowToGraphEdge } from "./neo-values.js";
import { fulltextIndexName } from "./schema-names.js";

function buildRelTypePattern(edgeTypes?: GraphEdgeType[]): string {
  if (edgeTypes != null && edgeTypes.length > 0) {
    return `:${edgeTypes.join("|")}`;
  }
  return "";
}

function edgeKey(rel: Relationship): string {
  const props = rel.properties as Record<string, unknown>;
  const id = props["id"];
  if (id != null && String(id) !== "") return String(id);
  return rel.elementId;
}

export class Neo4jReader {
  constructor(private readonly sessionFactory: () => Session) {}

  async getNode(id: string): Promise<GraphNode | null> {
    const session = this.sessionFactory();
    try {
      const res = await session.run(`MATCH (n {id: $id}) RETURN n LIMIT 1`, { id });
      const row = res.records[0];
      if (row == null) return null;
      const n = row.get("n");
      if (n == null) return null;
      return neoNodeToGraphNode(n);
    } finally {
      await session.close();
    }
  }

  async traverse(params: TraversalParams): Promise<GraphSearchResult> {
    const session = this.sessionFactory();
    try {
      const rel = buildRelTypePattern(params.edgeTypes);
      const maxDepth = neo4j.int(params.maxDepth);
      const limit = neo4j.int(params.limit);
      const twFrom = params.timeWindow?.from ?? null;
      const twTo = params.timeWindow?.to ?? null;
      const applyTw = twFrom != null || twTo != null;

      const query = `
        UNWIND $startIds AS sid
        MATCH (start {id: sid})
        MATCH path = (start)-[r${rel}*1..$maxDepth]-(end)
        WHERE NOT $applyTw OR ALL(rel IN relationships(path) WHERE
          ($twFrom IS NULL OR rel.invalid_at IS NULL OR rel.invalid_at >= $twFrom)
          AND ($twTo IS NULL OR rel.valid_at IS NULL OR rel.valid_at <= $twTo)
        )
        WITH path
        LIMIT $limit
        RETURN path
      `;

      const res = await session.run(query, {
        startIds: params.startNodeIds,
        maxDepth,
        limit,
        applyTw,
        twFrom,
        twTo,
      });

      const paths = res.records.map((rec) => neoPathToGraphPath(rec.get("path")));
      const nodeMap = new Map<string, GraphNode>();
      const edgeMap = new Map<string, GraphEdge>();

      for (const rec of res.records) {
        const path = rec.get("path");
        if (path == null) continue;
        for (const seg of path.segments) {
          nodeMap.set(nodeIdFromNeoNode(seg.start), neoNodeToGraphNode(seg.start));
          edgeMap.set(edgeKey(seg.relationship), rowToGraphEdge(seg.relationship, seg.start, seg.end));
          nodeMap.set(nodeIdFromNeoNode(seg.end), neoNodeToGraphNode(seg.end));
        }
      }

      return {
        nodes: [...nodeMap.values()],
        edges: [...edgeMap.values()],
        paths,
      };
    } finally {
      await session.close();
    }
  }

  async findNeighbors(nodeId: string, edgeTypes?: GraphEdgeType[], maxDepth = 1): Promise<GraphSearchResult> {
    const session = this.sessionFactory();
    try {
      const rel = buildRelTypePattern(edgeTypes);
      const depth = neo4j.int(maxDepth);
      const res = await session.run(
        `
        MATCH (n {id: $nodeId})
        MATCH path = (n)-[r${rel}*1..$depth]-(m)
        RETURN path
        `,
        { nodeId, depth },
      );

      const paths = res.records.map((rec) => neoPathToGraphPath(rec.get("path")));
      const nodeMap = new Map<string, GraphNode>();
      const edgeMap = new Map<string, GraphEdge>();

      for (const rec of res.records) {
        const path = rec.get("path");
        if (path == null) continue;
        for (const seg of path.segments) {
          nodeMap.set(nodeIdFromNeoNode(seg.start), neoNodeToGraphNode(seg.start));
          edgeMap.set(edgeKey(seg.relationship), rowToGraphEdge(seg.relationship, seg.start, seg.end));
          nodeMap.set(nodeIdFromNeoNode(seg.end), neoNodeToGraphNode(seg.end));
        }
      }

      return {
        nodes: [...nodeMap.values()],
        edges: [...edgeMap.values()],
        paths,
      };
    } finally {
      await session.close();
    }
  }

  async searchByText(
    tenantId: string,
    text: string,
    labels?: GraphNodeLabel[],
    limit = 25,
  ): Promise<GraphSearchResult> {
    const session = this.sessionFactory();
    try {
      const indexName = fulltextIndexName("Entity", "name");
      const lim = neo4j.int(limit);
      const res = await session.run(
        `
        CALL db.index.fulltext.queryNodes($indexName, $search) YIELD node, score
        WHERE node.tenant_id = $tenantId
        AND ($labels IS NULL OR size($labels) = 0 OR ANY(l IN labels(node) WHERE l IN $labels))
        RETURN node, score
        ORDER BY score DESC
        LIMIT $limit
        `,
        {
          indexName,
          search: text,
          tenantId,
          labels: labels ?? null,
          limit: lim,
        },
      );

      const nodes = res.records.map((rec) => neoNodeToGraphNode(rec.get("node")));
      const nodeIds = new Set(nodes.map((n) => n.id));

      const edgeRes = await session.run(
        `
        MATCH (a)-[r]->(b)
        WHERE a.id IN $nodeIds AND b.id IN $nodeIds
        RETURN r, a, b
        `,
        { nodeIds: [...nodeIds] },
      );

      const edges = edgeRes.records.map((rec) => rowToGraphEdge(rec.get("r"), rec.get("a"), rec.get("b")));

      return {
        nodes,
        edges,
        paths: [],
      };
    } finally {
      await session.close();
    }
  }
}
