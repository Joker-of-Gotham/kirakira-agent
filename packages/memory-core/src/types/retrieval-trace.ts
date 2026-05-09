export interface RouteCandidate {
  recordId: string;
  score: number;
  rank: number;
}

export interface RouteExplanation {
  routeName: string;
  candidates: RouteCandidate[];
  filters: Record<string, unknown>;
  durationMs: number;
}

export interface RetrievalTrace {
  traceId: string;
  queryId: string;
  normalizedQuery: string;
  routePlan: string[];
  routes: RouteExplanation[];
  fusionScores: Array<{ recordId: string; score: number; selected: boolean }>;
  rerankScores: Array<{ recordId: string; score: number; reason: string }>;
  budgetLevel: string;
  budgetDegradationReason?: string;
  totalDurationMs: number;
  createdAt: string;
}
