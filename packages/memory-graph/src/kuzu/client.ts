import type {
  GraphAdapter,
  GraphEdge,
  GraphEdgeType,
  GraphNode,
  GraphPath,
  GraphSearchResult,
  GraphUpsertEdge,
  GraphUpsertNode,
  TraversalParams,
} from "@kirakira/memory-core";

type KuzuDatabase = {
  init(): Promise<void>;
  close(): Promise<void>;
};
type KuzuConnection = {
  init(): Promise<void>;
  execute(query: string, params?: Record<string, unknown>): Promise<KuzuResult>;
};
type KuzuResult = {
  hasNext(): boolean;
  getNext(): Record<string, unknown>;
  getAll(): Promise<Array<Record<string, unknown>>>;
  close(): void;
};

function lazyKuzu(): { Database: new (dbPath: string) => KuzuDatabase; Connection: new (db: KuzuDatabase) => KuzuConnection } {
  return require("kuzu") as {
    Database: new (dbPath: string) => KuzuDatabase;
    Connection: new (db: KuzuDatabase) => KuzuConnection;
  };
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^A-Za-z0-9_]/g, "");
}

function sanitizeRelType(type: string): string {
  return type.replace(/[^A-Za-z0-9_]/g, "");
}

export class KuzuAdapter implements GraphAdapter {
  private db: KuzuDatabase | null = null;
  private conn: KuzuConnection | null = null;
  private readonly dbPath: string;
  private initialized = false;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  private async getConnection(): Promise<KuzuConnection> {
    if (!this.initialized) {
      const kuzu = lazyKuzu();
      this.db = new kuzu.Database(this.dbPath);
      await this.db.init();
      this.conn = new kuzu.Connection(this.db);
      await this.conn.init();
      this.initialized = true;
    }
    return this.conn!;
  }

  async ensureSchema(): Promise<void> {
    const conn = await this.getConnection();
    const nodeLabels = ["Entity", "Episode", "Fact", "Observation", "Belief", "Artifact", "Run", "Checkpoint", "ConceptCluster"];
    for (const label of nodeLabels) {
      await conn.execute(
        `CREATE NODE TABLE IF NOT EXISTS ${label} (id STRING, props STRING, createdAt STRING, PRIMARY KEY (id))`,
      );
    }

    const edgeTypes = [
      "ABOUT", "MENTIONS", "DERIVED_FROM", "SUPPORTS", "REFUTES",
      "NEXT_EPISODE", "PART_OF_RUN", "HAS_CHECKPOINT", "IN_CLUSTER", "CONTAINS",
    ];
    for (const etype of edgeTypes) {
      for (const fromLabel of nodeLabels) {
        for (const toLabel of nodeLabels) {
          try {
            await conn.execute(
              `CREATE REL TABLE IF NOT EXISTS ${etype}_${fromLabel}_${toLabel} (FROM ${fromLabel} TO ${toLabel}, eid STRING, validAt STRING, invalidAt STRING, expiredAt STRING, props STRING)`,
            );
          } catch {
            /* table may already exist with a different schema */
          }
        }
      }
    }
  }

  async upsertNode(node: GraphUpsertNode): Promise<void> {
    const conn = await this.getConnection();
    const label = sanitizeLabel(node.label);
    const now = new Date().toISOString();
    await conn.execute(
      `MERGE (n:${label} {id: $id}) SET n.props = $props, n.createdAt = $createdAt`,
      { id: node.id, props: JSON.stringify(node.props), createdAt: now },
    );
  }

  async upsertNodes(nodes: GraphUpsertNode[]): Promise<void> {
    for (const node of nodes) {
      await this.upsertNode(node);
    }
  }

  async upsertEdge(edge: GraphUpsertEdge): Promise<void> {
    const conn = await this.getConnection();
    const fromNode = await this.getNode(edge.from);
    const toNode = await this.getNode(edge.to);
    if (!fromNode || !toNode) return;

    const relTable = `${sanitizeRelType(edge.type)}_${sanitizeLabel(fromNode.label)}_${sanitizeLabel(toNode.label)}`;
    try {
      await conn.execute(
        `MATCH (a:${sanitizeLabel(fromNode.label)} {id: $from}), (b:${sanitizeLabel(toNode.label)} {id: $to}) ` +
        `CREATE (a)-[:${relTable} {eid: $eid, validAt: $validAt, invalidAt: $invalidAt, props: $props}]->(b)`,
        {
          from: edge.from,
          to: edge.to,
          eid: edge.id,
          validAt: edge.validAt ?? "",
          invalidAt: edge.invalidAt ?? "",
          props: JSON.stringify(edge.props ?? {}),
        },
      );
    } catch {
      /* edge may violate uniqueness if already created; ignore */
    }
  }

  async upsertEdges(edges: GraphUpsertEdge[]): Promise<void> {
    for (const edge of edges) {
      await this.upsertEdge(edge);
    }
  }

  async getNode(id: string): Promise<GraphNode | null> {
    const conn = await this.getConnection();
    const labels = ["Entity", "Episode", "Fact", "Observation", "Belief", "Artifact", "Run", "Checkpoint", "ConceptCluster"];
    for (const label of labels) {
      try {
        const result = await conn.execute(
          `MATCH (n:${label} {id: $id}) RETURN n.id AS id, n.props AS props, n.createdAt AS createdAt`,
          { id },
        );
        const rows = await result.getAll();
        result.close();
        if (rows.length > 0) {
          const row = rows[0]!;
          let props: Record<string, unknown> = {};
          try {
            props = JSON.parse(String(row["props"] ?? "{}"));
          } catch { /* */ }
          return {
            id: String(row["id"]),
            label: label as GraphNode["label"],
            props,
            createdAt: String(row["createdAt"] ?? ""),
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private deriveEdgeType(relTableName: string): GraphEdge["type"] {
    const known: GraphEdgeType[] = [
      "ABOUT", "MENTIONS", "DERIVED_FROM", "SUPPORTS", "REFUTES",
      "NEXT_EPISODE", "PART_OF_RUN", "HAS_CHECKPOINT", "IN_CLUSTER", "CONTAINS",
    ];
    for (const k of known) {
      if (relTableName.startsWith(k)) return k;
    }
    return relTableName.split("_")[0] as GraphEdge["type"];
  }

  async traverse(params: TraversalParams): Promise<GraphSearchResult> {
    const conn = await this.getConnection();
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const paths: GraphPath[] = [];
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();
    const edgeTypeFilter = params.edgeTypes && params.edgeTypes.length > 0
      ? new Set(params.edgeTypes)
      : null;

    for (const startId of params.startNodeIds) {
      const pathNodeIds: string[] = [startId];
      const pathEdgeIds: string[] = [];

      try {
        const result = await conn.execute(
          `MATCH (a {id: $startId})-[r]->(b) WHERE r.expiredAt IS NULL OR r.expiredAt = '' RETURN a.id AS fromId, label(a) AS fromLbl, b.id AS toId, label(b) AS toLbl, b.props AS props, b.createdAt AS createdAt, r.eid AS eid, r.validAt AS validAt, r.invalidAt AS invalidAt, r.props AS rProps, label(r) AS relLabel LIMIT ${params.limit}`,
          { startId },
        );
        const rows = await result.getAll();
        result.close();
        for (const row of rows) {
          const relLabel = String(row["relLabel"] ?? "");
          const derivedType = this.deriveEdgeType(relLabel);

          if (edgeTypeFilter && !edgeTypeFilter.has(derivedType)) continue;

          const validAt = String(row["validAt"] ?? "");
          if (params.timeWindow) {
            if (params.timeWindow.from && validAt && validAt < params.timeWindow.from) continue;
            if (params.timeWindow.to && validAt && validAt > params.timeWindow.to) continue;
          }

          const nid = String(row["toId"]);
          if (!nodeIds.has(nid)) {
            nodeIds.add(nid);
            let p: Record<string, unknown> = {};
            try { p = JSON.parse(String(row["props"] ?? "{}")); } catch { /* non-JSON props */ }
            nodes.push({
              id: nid,
              label: (String(row["toLbl"]) || "Entity") as GraphNode["label"],
              props: p,
              createdAt: String(row["createdAt"] ?? ""),
            });
          }

          const eid = String(row["eid"] ?? "");
          if (eid && !edgeIds.has(eid)) {
            edgeIds.add(eid);
            let rp: Record<string, unknown> = {};
            try { rp = JSON.parse(String(row["rProps"] ?? "{}")); } catch { /* non-JSON props */ }
            edges.push({
              id: eid,
              from: String(row["fromId"]),
              to: nid,
              type: derivedType,
              props: rp,
              validAt,
              createdAt: String(row["createdAt"] ?? ""),
            });
            pathNodeIds.push(nid);
            pathEdgeIds.push(eid);
          }
        }
      } catch {
        continue;
      }

      if (params.maxDepth > 1) {
        try {
          const deepResult = await conn.execute(
            `MATCH (a {id: $startId})-[*2..${params.maxDepth}]->(b) RETURN DISTINCT b.id AS id, label(b) AS lbl, b.props AS props, b.createdAt AS createdAt LIMIT ${params.limit}`,
            { startId },
          );
          const deepRows = await deepResult.getAll();
          deepResult.close();
          for (const row of deepRows) {
            const nid = String(row["id"]);
            if (nodeIds.has(nid)) continue;
            nodeIds.add(nid);
            let p: Record<string, unknown> = {};
            try { p = JSON.parse(String(row["props"] ?? "{}")); } catch { /* non-JSON props */ }
            nodes.push({
              id: nid,
              label: (String(row["lbl"]) || "Entity") as GraphNode["label"],
              props: p,
              createdAt: String(row["createdAt"] ?? ""),
            });
            pathNodeIds.push(nid);
          }
        } catch {
          /* deeper hops may fail if schema lacks multi-hop rel tables */
        }
      }

      if (pathNodeIds.length > 1) {
        paths.push({ nodeIds: pathNodeIds, edgeIds: pathEdgeIds, totalWeight: pathEdgeIds.length });
      }
    }

    return { nodes, edges, paths };
  }

  async findNeighbors(nodeId: string, edgeTypes?: GraphEdgeType[], maxDepth?: number): Promise<GraphSearchResult> {
    return this.traverse({
      startNodeIds: [nodeId],
      edgeTypes,
      maxDepth: maxDepth ?? 2,
      limit: 50,
    });
  }

  async invalidateEdge(id: string, expiredAt: string): Promise<void> {
    const conn = await this.getConnection();
    const labels = ["Entity", "Episode", "Fact", "Observation", "Belief", "Artifact", "Run", "Checkpoint", "ConceptCluster"];
    const edgeTypes = ["ABOUT", "MENTIONS", "DERIVED_FROM", "SUPPORTS", "REFUTES", "NEXT_EPISODE", "PART_OF_RUN", "HAS_CHECKPOINT", "IN_CLUSTER", "CONTAINS"];
    for (const etype of edgeTypes) {
      for (const fromLabel of labels) {
        for (const toLabel of labels) {
          try {
            await conn.execute(
              `MATCH ()-[r:${etype}_${fromLabel}_${toLabel} {eid: $eid}]->() SET r.expiredAt = $expiredAt`,
              { eid: id, expiredAt },
            );
          } catch {
            continue;
          }
        }
      }
    }
  }

  async invalidateEdges(nodeId: string, _edgeTypes?: GraphEdgeType[], expiredAt?: string): Promise<void> {
    const conn = await this.getConnection();
    const ts = expiredAt ?? new Date().toISOString();
    const labels = ["Entity", "Episode", "Fact", "Observation", "Belief", "Artifact", "Run", "Checkpoint", "ConceptCluster"];
    for (const label of labels) {
      try {
        await conn.execute(
          `MATCH (a:${label} {id: $id})-[r]->() SET r.expiredAt = $expiredAt`,
          { id: nodeId, expiredAt: ts },
        );
      } catch {
        continue;
      }
    }
  }

  async deleteNode(id: string): Promise<void> {
    const conn = await this.getConnection();
    const labels = ["Entity", "Episode", "Fact", "Observation", "Belief", "Artifact", "Run", "Checkpoint", "ConceptCluster"];
    for (const label of labels) {
      try {
        await conn.execute(`MATCH (n:${label} {id: $id}) DETACH DELETE n`, { id });
      } catch {
        continue;
      }
    }
  }

  async deleteNodes(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteNode(id);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
      this.conn = null;
      this.initialized = false;
    }
  }
}
