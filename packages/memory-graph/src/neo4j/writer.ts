import type { Session } from "neo4j-driver";
import type { GraphUpsertEdge, GraphUpsertNode } from "@kirakira/memory-core";

export class Neo4jWriter {
  constructor(private readonly sessionFactory: () => Session) {}

  async upsertNode(node: GraphUpsertNode): Promise<void> {
    const session = this.sessionFactory();
    try {
      const label = node.label;
      await session.run(
        `
        MERGE (n:\`${label}\` {id: $id})
        SET n += $props
        `,
        {
          id: node.id,
          props: node.props as Record<string, unknown>,
        },
      );
    } finally {
      await session.close();
    }
  }

  async upsertNodes(nodes: GraphUpsertNode[]): Promise<void> {
    if (nodes.length === 0) return;
    const session = this.sessionFactory();
    try {
      const byLabel = new Map<string, GraphUpsertNode[]>();
      for (const n of nodes) {
        const list = byLabel.get(n.label) ?? [];
        list.push(n);
        byLabel.set(n.label, list);
      }
      for (const [label, batch] of byLabel) {
        await session.run(
          `
          UNWIND $nodes AS row
          MERGE (n:\`${label}\` {id: row.id})
          SET n += row.props
          `,
          {
            nodes: batch.map((n) => ({
              id: n.id,
              props: n.props as Record<string, unknown>,
            })),
          },
        );
      }
    } finally {
      await session.close();
    }
  }

  async upsertEdge(edge: GraphUpsertEdge): Promise<void> {
    const session = this.sessionFactory();
    try {
      const type = edge.type;
      await session.run(
        `
        MATCH (a {id: $from})
        MATCH (b {id: $to})
        MERGE (a)-[r:\`${type}\` {id: $id}]->(b)
        SET r += $props,
            r.valid_at = $validAt,
            r.invalid_at = $invalidAt,
            r.created_at = coalesce(r.created_at, datetime())
        `,
        {
          id: edge.id,
          from: edge.from,
          to: edge.to,
          props: (edge.props ?? {}) as Record<string, unknown>,
          validAt: edge.validAt ?? null,
          invalidAt: edge.invalidAt ?? null,
        },
      );
    } finally {
      await session.close();
    }
  }

  async upsertEdges(edges: GraphUpsertEdge[]): Promise<void> {
    if (edges.length === 0) return;
    const session = this.sessionFactory();
    try {
      const byType = new Map<string, GraphUpsertEdge[]>();
      for (const e of edges) {
        const list = byType.get(e.type) ?? [];
        list.push(e);
        byType.set(e.type, list);
      }
      for (const [relType, batch] of byType) {
        await session.run(
          `
          UNWIND $edges AS row
          MATCH (a {id: row.from})
          MATCH (b {id: row.to})
          MERGE (a)-[r:\`${relType}\` {id: row.id}]->(b)
          SET r += row.props,
              r.valid_at = row.validAt,
              r.invalid_at = row.invalidAt,
              r.created_at = coalesce(r.created_at, datetime())
          `,
          {
            edges: batch.map((e) => ({
              id: e.id,
              from: e.from,
              to: e.to,
              props: (e.props ?? {}) as Record<string, unknown>,
              validAt: e.validAt ?? null,
              invalidAt: e.invalidAt ?? null,
            })),
          },
        );
      }
    } finally {
      await session.close();
    }
  }
}
