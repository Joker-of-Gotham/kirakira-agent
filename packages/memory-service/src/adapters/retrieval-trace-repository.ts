import type { RetrievalTrace } from "@kirakira/memory-core";
import type postgres from "postgres";

import type { PgSql } from "@kirakira/memory-store";

type FusionPayload = {
  fusion: RetrievalTrace["fusionScores"];
  rerank: RetrievalTrace["rerankScores"];
  budgetDegradationReason?: string;
};

export class RetrievalTraceRepository {
  constructor(private readonly sql: PgSql) {}

  async save(trace: RetrievalTrace): Promise<void> {
    const fusionPayload: FusionPayload = {
      fusion: trace.fusionScores,
      rerank: trace.rerankScores,
      budgetDegradationReason: trace.budgetDegradationReason,
    };
    await this.sql`
      INSERT INTO retrieval_traces (
        trace_id,
        query_id,
        normalized_query,
        route_plan,
        routes,
        fusion_scores,
        budget_level,
        total_duration_ms,
        created_at
      ) VALUES (
        ${trace.traceId}::uuid,
        ${trace.queryId},
        ${trace.normalizedQuery},
        ${this.sql.json(trace.routePlan as postgres.JSONValue)},
        ${this.sql.json(trace.routes as unknown as postgres.JSONValue)},
        ${this.sql.json(fusionPayload as postgres.JSONValue)},
        ${trace.budgetLevel},
        ${Math.round(trace.totalDurationMs)},
        ${new Date(trace.createdAt)}
      )
      ON CONFLICT (trace_id) DO UPDATE SET
        query_id = EXCLUDED.query_id,
        normalized_query = EXCLUDED.normalized_query,
        route_plan = EXCLUDED.route_plan,
        routes = EXCLUDED.routes,
        fusion_scores = EXCLUDED.fusion_scores,
        budget_level = EXCLUDED.budget_level,
        total_duration_ms = EXCLUDED.total_duration_ms,
        created_at = EXCLUDED.created_at
    `;
  }

  async load(traceId: string): Promise<RetrievalTrace | null> {
    const rows = await this.sql<
      {
        trace_id: string;
        query_id: string;
        normalized_query: string;
        route_plan: string[];
        routes: RetrievalTrace["routes"];
        fusion_scores: FusionPayload;
        budget_level: string;
        total_duration_ms: number;
        created_at: Date;
      }[]
    >`
      SELECT *
      FROM retrieval_traces
      WHERE trace_id = ${traceId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      traceId: row.trace_id,
      queryId: row.query_id,
      normalizedQuery: row.normalized_query,
      routePlan: row.route_plan,
      routes: row.routes,
      fusionScores: row.fusion_scores.fusion,
      rerankScores: row.fusion_scores.rerank,
      budgetLevel: row.budget_level,
      budgetDegradationReason: row.fusion_scores.budgetDegradationReason,
      totalDurationMs: row.total_duration_ms,
      createdAt: row.created_at.toISOString(),
    };
  }
}
