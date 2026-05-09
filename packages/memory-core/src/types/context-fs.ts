export type ContextLevel = "L0" | "L1" | "L2" | "L3";

export interface ContextL0 {
  level: "L0";
  abstract: string;
  entityCount: number;
  timeWindow?: { from?: string; to?: string };
  estimatedTokens: number;
}

export interface ContextL1 {
  level: "L1";
  factSummaries: string[];
  stateSummary?: string;
  observationSummaries: string[];
  estimatedTokens: number;
}

export interface ContextL2Card {
  id: string;
  kind: string;
  summary: string;
  provenance: string;
  routeReason: string;
  score: number;
}

export interface ContextL2 {
  level: "L2";
  cards: ContextL2Card[];
  estimatedTokens: number;
}

export interface ContextL3Evidence {
  id: string;
  sourceRecordId: string;
  rawSpan?: string;
  artifactPointer?: string;
  graphPath?: string[];
  checkpointState?: Record<string, unknown>;
}

export interface ContextL3 {
  level: "L3";
  evidence: ContextL3Evidence[];
  estimatedTokens: number;
}

export interface ContextBundle {
  queryId: string;
  levels: {
    l0: ContextL0;
    l1?: ContextL1;
    l2?: ContextL2;
    l3?: ContextL3;
  };
  totalEstimatedTokens: number;
}
