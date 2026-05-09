import type {
  GraphAdapter,
  GraphEdgeType,
  GraphUpsertEdge,
  GraphUpsertNode,
  TraversalParams,
} from "@kirakira/memory-core";
import { Neo4jClient } from "./client.js";
import { Neo4jReader } from "./reader.js";
import { Neo4jSchemaManager } from "./schema-manager.js";
import { Neo4jTemporal } from "./temporal.js";
import { Neo4jWriter } from "./writer.js";

export class Neo4jAdapter implements GraphAdapter {
  private readonly client: Neo4jClient;
  private readonly schema: Neo4jSchemaManager;
  private readonly writer: Neo4jWriter;
  private readonly reader: Neo4jReader;
  private readonly temporal: Neo4jTemporal;

  constructor(client: Neo4jClient) {
    this.client = client;
    const sessionFactory = (): ReturnType<Neo4jClient["getSession"]> => client.getSession();
    this.schema = new Neo4jSchemaManager(sessionFactory);
    this.writer = new Neo4jWriter(sessionFactory);
    this.reader = new Neo4jReader(sessionFactory);
    this.temporal = new Neo4jTemporal(sessionFactory);
  }

  ensureSchema(): Promise<void> {
    return this.schema.ensureSchema();
  }

  upsertNode(node: GraphUpsertNode): Promise<void> {
    return this.writer.upsertNode(node);
  }

  upsertNodes(nodes: GraphUpsertNode[]): Promise<void> {
    return this.writer.upsertNodes(nodes);
  }

  upsertEdge(edge: GraphUpsertEdge): Promise<void> {
    return this.writer.upsertEdge(edge);
  }

  upsertEdges(edges: GraphUpsertEdge[]): Promise<void> {
    return this.writer.upsertEdges(edges);
  }

  getNode(id: string) {
    return this.reader.getNode(id);
  }

  traverse(params: TraversalParams) {
    return this.reader.traverse(params);
  }

  findNeighbors(nodeId: string, edgeTypes?: GraphEdgeType[], maxDepth?: number) {
    return this.reader.findNeighbors(nodeId, edgeTypes, maxDepth);
  }

  invalidateEdge(id: string, expiredAt: string): Promise<void> {
    return this.temporal.invalidateEdge(id, expiredAt);
  }

  invalidateEdges(nodeId: string, edgeTypes?: GraphEdgeType[], expiredAt?: string): Promise<void> {
    const ts = expiredAt ?? new Date().toISOString();
    return this.temporal.invalidateEdgesByNode(nodeId, edgeTypes, ts);
  }

  async deleteNode(id: string): Promise<void> {
    const session = this.client.getSession();
    try {
      await session.run(`MATCH (n {id: $id}) DETACH DELETE n`, { id });
    } finally {
      await session.close();
    }
  }

  async deleteNodes(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const session = this.client.getSession();
    try {
      await session.run(
        `
        UNWIND $ids AS id
        MATCH (n {id: id})
        DETACH DELETE n
        `,
        { ids },
      );
    } finally {
      await session.close();
    }
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
