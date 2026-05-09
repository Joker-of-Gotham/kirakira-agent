import { z } from "zod";

export const routeCandidateSchema = z.object({
  recordId: z.string().min(1),
  score: z.number(),
  rank: z.number().int().min(0),
});

export const routeExplanationSchema = z.object({
  routeName: z.string().min(1),
  candidates: z.array(routeCandidateSchema),
  filters: z.record(z.unknown()),
  durationMs: z.number().min(0),
});

export const retrievalTraceSchema = z.object({
  traceId: z.string().min(1),
  queryId: z.string().min(1),
  normalizedQuery: z.string(),
  routePlan: z.array(z.string()),
  routes: z.array(routeExplanationSchema),
  fusionScores: z.array(z.object({
    recordId: z.string(),
    score: z.number(),
    selected: z.boolean(),
  })),
  rerankScores: z.array(z.object({
    recordId: z.string(),
    score: z.number(),
    reason: z.string(),
  })),
  budgetLevel: z.string(),
  budgetDegradationReason: z.string().optional(),
  totalDurationMs: z.number().min(0),
  createdAt: z.string().datetime(),
});
