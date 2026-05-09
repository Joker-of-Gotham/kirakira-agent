import type { GraphNode, GraphSearchResult, TraversalParams, GraphNodeLabel, GraphEdgeType } from "../types/graph-node.js";

export interface GraphUpsertNode {
  id: string;
  label: GraphNodeLabel;
  props: Record<string, unknown>;
}

export interface GraphUpsertEdge {
  id: string;
  type: GraphEdgeType;
  from: string;
  to: string;
  validAt?: string;
  invalidAt?: string;
  props?: Record<string, unknown>;
}

export interface GraphQueryFilter {
  tenantId: string;
  labels?: GraphNodeLabel[];
  edgeTypes?: GraphEdgeType[];
  timeWindow?: { from?: string; to?: string };
  entityIds?: string[];
}

export interface GraphAdapter {
  ensureSchema(): Promise<void>;

  upsertNode(node: GraphUpsertNode): Promise<void>;
  upsertNodes(nodes: GraphUpsertNode[]): Promise<void>;
  upsertEdge(edge: GraphUpsertEdge): Promise<void>;
  upsertEdges(edges: GraphUpsertEdge[]): Promise<void>;

  getNode(id: string): Promise<GraphNode | null>;
  traverse(params: TraversalParams): Promise<GraphSearchResult>;
  findNeighbors(nodeId: string, edgeTypes?: GraphEdgeType[], maxDepth?: number): Promise<GraphSearchResult>;

  invalidateEdge(id: string, expiredAt: string): Promise<void>;
  invalidateEdges(nodeId: string, edgeTypes?: GraphEdgeType[], expiredAt?: string): Promise<void>;

  deleteNode(id: string): Promise<void>;
  deleteNodes(ids: string[]): Promise<void>;

  close(): Promise<void>;
}
