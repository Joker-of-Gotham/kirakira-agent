import type {
  MemoryRecord,
  RecallRoute,
  RecallRouteInput,
  RecallStreamEvent,
  StreamingRecallOptions,
  ContextLevel,
} from "@kirakira/memory-core";

import type { EmbeddingClient } from "@kirakira/memory-vector";
import type { MemoryServiceConfig } from "../config.js";
import { BudgetCompiler, type RankedExplanation } from "./budget/budget-compiler.js";
import { estimateTokensSync } from "./budget/token-estimator.js";
import { fuseRouteResults } from "./fusion/route-fusion.js";
import { RetrievalReranker } from "./fusion/reranker.js";
import { planRecallQuery } from "./query-planner.js";
import { buildRetrievalTrace, type FusionScoreRow } from "./trace/retrieval-trace-builder.js";
import { ContextAssembler } from "../context/context-fs.js";
import { randomUUID } from "node:crypto";

function asContextLevel(level: string | undefined, fallback: ContextLevel): ContextLevel {
  if (level === "L0" || level === "L1" || level === "L2" || level === "L3") return level;
  return fallback;
}

/**
 * Streaming recall pipeline that yields incremental results via AsyncGenerator.
 * Enables progressive context injection: the agent receives L0 immediately,
 * then deeper results as routes complete.
 */
export class StreamingRecallPipeline {
  private readonly budgetCompiler = new BudgetCompiler();
  private readonly reranker = new RetrievalReranker();
  private readonly contextAssembler = new ContextAssembler();

  constructor(
    private readonly deps: {
      routes: RecallRoute[];
      embedding: EmbeddingClient;
      serviceConfig: MemoryServiceConfig;
    },
  ) {}

  async *stream(req: StreamingRecallOptions): AsyncGenerator<RecallStreamEvent, void, unknown> {
    const startedAt = performance.now();
    const queryId = randomUUID();
    const traceId = randomUUID();
    const nowIso = () => new Date().toISOString();

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
    const allRecordsByRoute: Array<{
      route: RecallRoute;
      records: Array<{ record: MemoryRecord; score: number }>;
      explanation: import("@kirakira/memory-core").RouteExplanation;
    }> = [];

    let earlyL0Emitted = false;

    for (const route of routesToRun) {
      yield { type: "route:start", routeName: route.name, timestamp: nowIso() };

      const routeStart = performance.now();
      const lim = plan.perRouteLimit[route.name] ?? 16;
      const input: RecallRouteInput = { ...routeInputBase, limit: lim };
      const result = await route.execute(input);
      const routeDuration = performance.now() - routeStart;

      allRecordsByRoute.push({
        route,
        records: result.records,
        explanation: result.explanation,
      });

      yield {
        type: "route:complete",
        routeName: route.name,
        candidateCount: result.records.length,
        explanation: result.explanation,
        durationMs: routeDuration,
        timestamp: nowIso(),
      };

      if (req.earlyL0 && !earlyL0Emitted && result.records.length > 0) {
        const earlyRecords = result.records.map((r) => r.record);
        const l0 = this.contextAssembler.buildL0(earlyRecords, req.query);
        yield {
          type: "context:partial",
          level: "L0",
          context: { queryId, levels: { l0 }, totalEstimatedTokens: l0.estimatedTokens },
          records: earlyRecords,
          estimatedTokens: l0.estimatedTokens,
          timestamp: nowIso(),
        };
        earlyL0Emitted = true;
      }
    }

    const routeLists = allRecordsByRoute.map(({ route, records }) => ({
      routeName: route.name,
      weight: route.weight,
      rankedIds: records.map((row, i) => ({ id: row.record.id, rank: i + 1 })),
    }));

    const fused = fuseRouteResults(routeLists);
    const limit = req.limit ?? 32;
    const fusedTop = fused.slice(0, limit * 2);

    const recordById = new Map<string, MemoryRecord>();
    for (const { records } of allRecordsByRoute) {
      for (const row of records) {
        if (!recordById.has(row.record.id)) recordById.set(row.record.id, row.record);
      }
    }

    const fusedRecords = fusedTop
      .map(({ id, score }) => {
        const rec = recordById.get(id);
        return rec ? { record: rec, score } : null;
      })
      .filter((x): x is { record: MemoryRecord; score: number } => x !== null);

    const reranked = this.reranker.rerank(fusedRecords);

    yield {
      type: "fusion:complete",
      totalCandidates: fusedRecords.length,
      selectedCount: Math.min(reranked.length, limit),
      timestamp: nowIso(),
    };

    const explanations: RankedExplanation[] = reranked.map((r) => ({
      recordId: r.record.id,
      routeReason: r.reason,
      score: r.score,
    }));

    const finalRecords = reranked.slice(0, limit).map((r) => r.record);
    const level = asContextLevel(req.level ?? this.deps.serviceConfig.recall.defaultLevel, "L2");
    const tokenBudget = req.tokenBudget ?? defaultBudget;
    const compiled = await this.budgetCompiler.compile(finalRecords, queryId, explanations, tokenBudget, level);

    const fusionRows: FusionScoreRow[] = fusedTop.map((f) => ({
      recordId: f.id,
      score: f.score,
      selected: finalRecords.some((r) => r.id === f.id),
    }));

    const routeExplanations = allRecordsByRoute.map((x) => x.explanation);
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

    const totalTokens = estimateTokensSync(JSON.stringify(compiled.context));

    yield {
      type: "done",
      context: compiled.context,
      trace,
      recordIds: finalRecords.map((r) => r.id),
      totalTokens,
      totalDurationMs: performance.now() - startedAt,
      timestamp: nowIso(),
    };
  }
}
