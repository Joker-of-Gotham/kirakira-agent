import type { ContextLevel, RetrievalTrace, RouteExplanation } from "@kirakira/memory-core";
import type { QueryPlan } from "../query-planner.js";

export interface FusionScoreRow {
  recordId: string;
  score: number;
  selected: boolean;
}

export interface RerankScoreRow {
  recordId: string;
  score: number;
  reason: string;
}

export interface RetrievalTraceBuildInput {
  traceId: string;
  queryId: string;
  plan: QueryPlan;
  routeExplanations: RouteExplanation[];
  fusionScores: FusionScoreRow[];
  rerankScores: RerankScoreRow[];
  budgetLevel: ContextLevel;
  budgetDegradationReason?: string;
  startedAtMs: number;
}

export function buildRetrievalTrace(input: RetrievalTraceBuildInput): RetrievalTrace {
  const now = new Date().toISOString();
  return {
    traceId: input.traceId,
    queryId: input.queryId,
    normalizedQuery: input.plan.normalizedQuery,
    routePlan: input.plan.activeRoutes,
    routes: input.routeExplanations,
    fusionScores: input.fusionScores,
    rerankScores: input.rerankScores,
    budgetLevel: input.budgetLevel,
    budgetDegradationReason: input.budgetDegradationReason,
    totalDurationMs: performance.now() - input.startedAtMs,
    createdAt: now,
  };
}
