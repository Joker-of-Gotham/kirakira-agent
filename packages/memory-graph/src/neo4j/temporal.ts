import neo4j from "neo4j-driver";
import type { Session } from "neo4j-driver";
import type { GraphEdge, GraphEdgeType, GraphNode, GraphSearchResult } from "@kirakira/memory-core";
import { neoNodeToGraphNode, rowToGraphEdge } from "./neo-values.js";

export class Neo4jTemporal {
  constructor(private readonly sessionFactory: () => Session) {}

  async invalidateEdge(id: string, expiredAt: string): Promise<void> {
    const session = this.sessionFactory();
    try {
      await session.run(
        `
        MATCH ()-[r {id: $id}]-()
        SET r.expired_at = $expiredAt,
            r.invalid_at = $expiredAt
        `,
        { id, expiredAt },
      );
    } finally {
      await session.close();
    }
  }

  async invalidateEdgesByNode(nodeId: string, edgeTypes: GraphEdgeType[] | undefined, expiredAt: string): Promise<void> {
    const session = this.sessionFactory();
    try {
      await session.run(
        `
        MATCH (n {id: $nodeId})-[r]-()
        WHERE $edgeTypes IS NULL OR type(r) IN $edgeTypes
        SET r.expired_at = $expiredAt,
            r.invalid_at = $expiredAt
        `,
        {
          nodeId,
          edgeTypes: edgeTypes ?? null,
          expiredAt,
        },
      );
    } finally {
      await session.close();
    }
  }

  async queryValidAt(nodeId: string, timestamp: string): Promise<GraphSearchResult> {
    const session = this.sessionFactory();
    try {
      const res = await session.run(
        `
        MATCH (n {id: $nodeId})-[r]-(m)
        WHERE
          (r.valid_at IS NULL OR r.valid_at <= $timestamp)
          AND (r.invalid_at IS NULL OR r.invalid_at > $timestamp)
          AND (r.expired_at IS NULL OR r.expired_at > $timestamp)
        RETURN r, n, m
        LIMIT $limit
        `,
        {
          nodeId,
          timestamp,
          limit: neo4j.int(500),
        },
      );

      return edgesAndNodesFromRelRows(res.records);
    } finally {
      await session.close();
    }
  }

  async queryBiTemporal(nodeId: string, validAt: string, txAt: string): Promise<GraphSearchResult> {
    const session = this.sessionFactory();
    try {
      const res = await session.run(
        `
        MATCH (n {id: $nodeId})-[r]-(m)
        WHERE
          (r.valid_at IS NULL OR r.valid_at <= $validAt)
          AND (r.invalid_at IS NULL OR r.invalid_at > $validAt)
          AND (r.created_at IS NULL OR datetime(r.created_at) <= datetime($txAt))
          AND (r.expired_at IS NULL OR datetime(r.expired_at) > datetime($txAt))
        RETURN r, n, m
        LIMIT $limit
        `,
        {
          nodeId,
          validAt,
          txAt,
          limit: neo4j.int(500),
        },
      );

      return edgesAndNodesFromRelRows(res.records);
    } finally {
      await session.close();
    }
  }
}

function edgesAndNodesFromRelRows(records: ReadonlyArray<import("neo4j-driver").Record>): GraphSearchResult {
  const edges: GraphEdge[] = [];
  const nodeMap = new Map<string, GraphNode>();

  for (const rec of records) {
    const r = rec.get("r");
    const a = rec.get("n");
    const b = rec.get("m");
    if (r == null || a == null || b == null) continue;
    const rel = r as import("neo4j-driver").Relationship;
    const nodeA = a as import("neo4j-driver").Node;
    const nodeB = b as import("neo4j-driver").Node;
    const fromNode = nodeA.elementId === rel.startNodeElementId ? nodeA : nodeB;
    const toNode = nodeA.elementId === rel.endNodeElementId ? nodeA : nodeB;
    edges.push(rowToGraphEdge(rel, fromNode, toNode));
    nodeMap.set(nodeIdKey(nodeA), neoNodeToGraphNode(nodeA));
    nodeMap.set(nodeIdKey(nodeB), neoNodeToGraphNode(nodeB));
  }

  return {
    nodes: [...nodeMap.values()],
    edges,
    paths: [],
  };
}

function nodeIdKey(node: import("neo4j-driver").Node): string {
  return node.elementId;
}
