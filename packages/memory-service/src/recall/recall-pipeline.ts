import type {
  ContextLevel,
  MemoryBundle,
  MemoryRecord,
  RecallRequest,
  RecallRoute,
  RecallRouteInput,
} from "@kirakira/memory-core";

import type { EmbeddingClient } from "@kirakira/memory-vector";
import type { MemoryServiceConfig } from "../config.js";
import { BudgetCompiler, type RankedExplanation } from "./budget/budget-compiler.js";
import { estimateTokensSync } from "./budget/token-estimator.js";
import { fuseRouteResults } from "./fusion/route-fusion.js";
import { RetrievalReranker } from "./fusion/reranker.js";
import { planRecallQuery, type QueryPlan } from "./query-planner.js";
import { buildRetrievalTrace, type FusionScoreRow } from "./trace/retrieval-trace-builder.js";
import { randomUUID } from "node:crypto";

function asContextLevel(level: string | undefined, fallback: ContextLevel): ContextLevel {
  if (level === "L0" || level === "L1" || level === "L2" || level === "L3") return level;
  return fallback;
}

export class RecallPipeline {
  private readonly budgetCompiler = new BudgetCompiler();
  private readonly reranker = new RetrievalReranker();

  constructor(
    private readonly deps: {
      routes: RecallRoute[];
      embedding: EmbeddingClient;
      serviceConfig: MemoryServiceConfig;
    },
  ) {}

  async run(req: RecallRequest): Promise<MemoryBundle> {
    const startedAt = performance.now();
    const queryId = randomUUID();
    const traceId = randomUUID();

    const defaultBudget = this.deps.serviceConfig.recall.defaultTokenBudget ?? 4096;
    const plan = planRecallQuery(req, { tokenBudget: defaultBudget });

    const embeddings = await this.deps.embedding.embed([req.query]);
    const embedding = embeddings[0] ?? [];

    const routeInputBase: Omit<RecallRouteInput, "limit"> = {
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      query: req.query,
      normalizedQuery: plan.normalizedQuery,
      entityIds: plan.entityReferences,
      kinds: req.kinds,
      timeWindow: plan.timeWindow,
      runId: req.runId,
      sessionId: req.sessionId,
      embedding,
    };

    const active = new Set<string>(plan.activeRoutes);
    const routesToRun = this.deps.routes.filter((r) => active.has(r.name));

    const routeResults = await Promise.all(
      routesToRun.map(async (r) => {
        const lim = plan.perRouteLimit[r.name] ?? 16;
        const input: RecallRouteInput = { ...routeInputBase, limit: lim };
        return { route: r, result: await r.execute(input) };
      }),
    );

    const routeLists = routeResults.map(({ route, result }) => ({
      routeName: route.name,
      weight: route.weight,
      rankedIds: result.records.map((row, i) => ({
        id: row.record.id,
        rank: i + 1,
      })),
    }));

    const fused = fuseRouteResults(routeLists);
    const limit = req.limit ?? 32;
    const fusedTop = fused.slice(0, limit * 2);

    const recordById = new Map<string, MemoryRecord>();
    for (const { result } of routeResults) {
      for (const row of result.records) {
        if (!recordById.has(row.record.id)) {
          recordById.set(row.record.id, row.record);
        }
      }
    }

    const fusedRecords: Array<{ record: MemoryRecord; score: number }> = [];
    for (const { id, score } of fusedTop) {
      const rec = recordById.get(id);
      if (rec) {
        fusedRecords.push({ record: rec, score });
      }
    }

    const reranked = this.reranker.rerank(fusedRecords);

    const explanations: RankedExplanation[] = reranked.map((r) => ({
      recordId: r.record.id,
      routeReason: r.reason,
      score: r.score,
    }));

    const finalRecords = reranked.slice(0, limit).map((r) => r.record);

    const level = asContextLevel(req.level ?? this.deps.serviceConfig.recall.defaultLevel, "L2");
    const tokenBudget = req.tokenBudget ?? defaultBudget;
    const compiled = await this.budgetCompiler.compile(
      finalRecords,
      queryId,
      explanations,
      tokenBudget,
      level,
    );

    const fusionRows: FusionScoreRow[] = fusedTop.map((f) => ({
      recordId: f.id,
      score: f.score,
      selected: finalRecords.some((r) => r.id === f.id),
    }));

    const routeExplanations = routeResults.map((x) => x.result.explanation);
    const trace = buildRetrievalTrace({
      traceId,
      queryId,
      plan,
      routeExplanations,
      fusionScores: fusionRows,
      rerankScores: reranked.map((r) => ({
        recordId: r.record.id,
        score: r.score,
        reason: r.reason,
      })),
      budgetLevel: compiled.effectiveLevel,
      budgetDegradationReason: compiled.degradationReason,
      startedAtMs: startedAt,
    });

    const totalTokens = estimateTokensSync(
      JSON.stringify(compiled.context.levels.l0) +
        (compiled.context.levels.l1 ? JSON.stringify(compiled.context.levels.l1) : "") +
        (compiled.context.levels.l2 ? JSON.stringify(compiled.context.levels.l2) : "") +
        (compiled.context.levels.l3 ? JSON.stringify(compiled.context.levels.l3) : ""),
    );

    return {
      id: randomUUID(),
      queryId,
      context: compiled.context,
      trace,
      recordIds: finalRecords.map((r) => r.id),
      totalTokens,
      createdAt: new Date().toISOString(),
    };
  }
}

export type { QueryPlan };
