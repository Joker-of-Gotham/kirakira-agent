import type { GraphPath, GraphEdge, GraphNode, GraphSearchResult } from "@kirakira/memory-core";

export interface GraphQueryOptions {
  tenantId: string;
  timeWindow?: { from?: string; to?: string };
  maxDepth?: number;
  limit?: number;
}

export interface CommunityInfo {
  id: string;
  nodeIds: string[];
  label: string;
  size: number;
}

export interface TemporalEdgeQuery {
  nodeId: string;
  edgeTypes?: string[];
  validAt?: string;
  includeExpired?: boolean;
}

export type { GraphEdge, GraphNode, GraphPath, GraphSearchResult };
