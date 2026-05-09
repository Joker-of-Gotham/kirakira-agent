export type GraphNodeLabel =
  | "Entity"
  | "Episode"
  | "Fact"
  | "Observation"
  | "Belief"
  | "Artifact"
  | "Run"
  | "Checkpoint"
  | "ConceptCluster";

export type GraphEdgeType =
  | "ABOUT"
  | "MENTIONS"
  | "DERIVED_FROM"
  | "SUPPORTS"
  | "REFUTES"
  | "NEXT_EPISODE"
  | "PART_OF_RUN"
  | "HAS_CHECKPOINT"
  | "IN_CLUSTER"
  | "CONTAINS";

export interface GraphNode {
  id: string;
  label: GraphNodeLabel;
  props: Record<string, unknown>;
  createdAt: string;
}

export interface GraphEdge {
  id: string;
  type: GraphEdgeType;
  from: string;
  to: string;
  validAt?: string;
  invalidAt?: string;
  createdAt: string;
  expiredAt?: string;
  props?: Record<string, unknown>;
}

export interface GraphSearchResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths: GraphPath[];
}

export interface GraphPath {
  nodeIds: string[];
  edgeIds: string[];
  totalWeight: number;
}

export interface TraversalParams {
  startNodeIds: string[];
  edgeTypes?: GraphEdgeType[];
  maxDepth: number;
  timeWindow?: { from?: string; to?: string };
  limit: number;
}
