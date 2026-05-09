import neo4j from "neo4j-driver";
import type { Session } from "neo4j-driver";
import { randomUUID } from "node:crypto";
import type { CommunityInfo } from "../types.js";

export type CommunityAlgorithm = "louvain" | "label_propagation" | "auto";

export class Neo4jCommunity {
  constructor(private readonly sessionFactory: () => Session) {}

  async detectCommunities(tenantId: string, algorithm: CommunityAlgorithm = "auto"): Promise<CommunityInfo[]> {
    const graphName = `g_${randomUUID().replace(/-/g, "")}`;
    const session = this.sessionFactory();
    try {
      await session.run(
        `
        CALL gds.graph.project.cypher(
          $graphName,
          $nodeQuery,
          $relQuery,
          { parameters: $projectionParams }
        )
        YIELD graphName AS projected
        RETURN projected
        `,
        {
          graphName,
          nodeQuery: `MATCH (n) WHERE n.tenant_id = $tenantId RETURN id(n) AS id`,
          relQuery: `MATCH (n)-[r]->(m) WHERE n.tenant_id = $tenantId AND m.tenant_id = $tenantId RETURN id(n) AS source, id(m) AS target, type(r) AS type`,
          projectionParams: { tenantId },
        },
      );

      try {
        if (algorithm === "label_propagation") {
          return await this.collectCommunities(session, graphName, "label_propagation");
        }
        if (algorithm === "louvain") {
          return await this.collectCommunities(session, graphName, "louvain");
        }
        try {
          return await this.collectCommunities(session, graphName, "louvain");
        } catch {
          return await this.collectCommunities(session, graphName, "label_propagation");
        }
      } finally {
        await session.run(`CALL gds.graph.drop($graphName) YIELD graphName`, { graphName }).catch(() => undefined);
      }
    } finally {
      await session.close();
    }
  }

  private async collectCommunities(
    session: Session,
    graphName: string,
    method: "louvain" | "label_propagation",
  ): Promise<CommunityInfo[]> {
    const call =
      method === "louvain"
        ? `CALL gds.louvain.stream($graphName) YIELD nodeId, communityId`
        : `CALL gds.labelPropagation.stream($graphName) YIELD nodeId, communityId`;

    const res = await session.run(
      `
      ${call}
      WITH nodeId, communityId
      RETURN gds.util.asNode(nodeId).id AS id, communityId
      `,
      { graphName },
    );

    const byCommunity = new Map<string, string[]>();
    for (const rec of res.records) {
      const rawId = rec.get("id");
      const nodeId = rawId != null ? String(rawId) : "";
      const cidVal = rec.get("communityId");
      const cid = neo4j.isInt(cidVal) ? cidVal.toString() : String(cidVal);
      const list = byCommunity.get(cid) ?? [];
      if (nodeId !== "") list.push(nodeId);
      byCommunity.set(cid, list);
    }

    return [...byCommunity.entries()].map(([cid, nodeIds]) => ({
      id: cid,
      nodeIds,
      label: `community-${cid}`,
      size: nodeIds.length,
    }));
  }

  async getCommunity(communityId: string): Promise<CommunityInfo | null> {
    const session = this.sessionFactory();
    try {
      const res = await session.run(
        `
        MATCH (c:ConceptCluster {id: $id})<-[:IN_CLUSTER]-(n)
        RETURN c, collect(DISTINCT n.id) AS nodeIds
        `,
        { id: communityId },
      );
      const row = res.records[0];
      if (row == null) return null;
      const idsUnknown = row.get("nodeIds");
      const nodeIds = (Array.isArray(idsUnknown) ? idsUnknown : []).map((x) => String(x));
      const c = row.get("c");
      const labelUnknown = c != null && typeof c === "object" && "properties" in c ? (c as { properties?: { label?: unknown } }).properties?.label : undefined;
      return {
        id: communityId,
        nodeIds,
        label: labelUnknown != null ? String(labelUnknown) : "ConceptCluster",
        size: nodeIds.length,
      };
    } finally {
      await session.close();
    }
  }

  async assignToCommunity(nodeId: string, communityId: string): Promise<void> {
    const session = this.sessionFactory();
    try {
      const edgeId = randomUUID();
      await session.run(
        `
        MATCH (n {id: $nodeId})
        MERGE (c:ConceptCluster {id: $communityId})
        MERGE (n)-[r:IN_CLUSTER {id: $edgeId}]->(c)
        SET r.created_at = coalesce(r.created_at, datetime())
        `,
        { nodeId, communityId, edgeId },
      );
    } finally {
      await session.close();
    }
  }
}
