import type {
  ContextBundle,
  ContextL0,
  ContextL1,
  ContextL2,
  ContextL3,
  ContextLevel,
  MemoryRecord,
} from "@kirakira/memory-core";

import { BudgetCompiler, type RankedExplanation } from "../recall/budget/budget-compiler.js";
import { estimateTokensSync } from "../recall/budget/token-estimator.js";

function entityCount(records: MemoryRecord[]): number {
  const s = new Set<string>();
  for (const r of records) {
    for (const e of r.entityIds) s.add(e);
  }
  return s.size;
}

/**
 * Builds the L0–L3 context filesystem views that agents consume during recall.
 */
export class ContextAssembler {
  private readonly compiler = new BudgetCompiler();

  buildL0(records: MemoryRecord[], query: string): ContextL0 {
    const ec = entityCount(records);
    const abstract = `Q: ${query.slice(0, 200)} · ${records.length} hits · ${ec} entities`;
    const timeFrom = records.map((r) => r.validFrom).find(Boolean);
    const timeTo = records.map((r) => r.validTo).find(Boolean);
    return {
      level: "L0",
      abstract,
      entityCount: ec,
      timeWindow: timeFrom || timeTo ? { from: timeFrom ?? undefined, to: timeTo ?? undefined } : undefined,
      estimatedTokens: estimateTokensSync(abstract),
    };
  }

  buildL1(records: MemoryRecord[]): ContextL1 {
    const factish = records.filter((r) => r.kind === "fact" || r.kind === "observation");
    const factSummaries = factish.map((r) => r.summaryL0 ?? r.text?.slice(0, 240) ?? r.id);
    const observationSummaries = records
      .filter((r) => r.kind === "observation")
      .map((o) => o.overviewL1 ?? o.summaryL0 ?? "");
    const stateSummary = records.find((r) => r.kind === "checkpoint")?.summaryL0;
    const estimatedTokens =
      estimateTokensSync([...factSummaries, ...observationSummaries].join("\n")) +
      estimateTokensSync(stateSummary ?? "");
    return {
      level: "L1",
      factSummaries,
      stateSummary,
      observationSummaries,
      estimatedTokens,
    };
  }

  buildL2(records: MemoryRecord[], explanations: RankedExplanation[]): ContextL2 {
    const expById = new Map(explanations.map((e) => [e.recordId, e] as const));
    const cards = records.slice(0, 24).map((r) => ({
      id: r.id,
      kind: r.kind,
      summary: r.summaryL0 ?? r.text?.slice(0, 200) ?? r.id,
      provenance: r.evidenceIds.join(","),
      routeReason: expById.get(r.id)?.routeReason ?? "unknown",
      score: expById.get(r.id)?.score ?? 0,
    }));
    return {
      level: "L2",
      cards,
      estimatedTokens: cards.reduce((acc, c) => acc + estimateTokensSync(c.summary), 0),
    };
  }

  buildL3(records: MemoryRecord[]): ContextL3 {
    const evidence = records.map((r) => ({
      id: r.id,
      sourceRecordId: r.id,
      rawSpan: r.text,
      artifactPointer: typeof r.metadata["artifactUri"] === "string" ? r.metadata["artifactUri"] : undefined,
      graphPath: Array.isArray(r.metadata["_graphPath"]) ? (r.metadata["_graphPath"] as string[]) : undefined,
      checkpointState: r.kind === "checkpoint" ? r.metadata : undefined,
    }));
    return {
      level: "L3",
      evidence,
      estimatedTokens: evidence.reduce((acc, e) => acc + estimateTokensSync(e.rawSpan ?? ""), 0),
    };
  }

  async assemble(
    records: MemoryRecord[],
    query: string,
    explanations: RankedExplanation[],
    tokenBudget: number,
    level: ContextLevel,
  ): Promise<ContextBundle> {
    const queryId = `ctx:${estimateTokensSync(query)}:${records.length}`;
    const compiled = await this.compiler.compile(records, queryId, explanations, tokenBudget, level);
    const l0 = this.buildL0(records, query);
    const totalEstimatedTokens =
      l0.estimatedTokens +
      (compiled.context.levels.l1?.estimatedTokens ?? 0) +
      (compiled.context.levels.l2?.estimatedTokens ?? 0) +
      (compiled.context.levels.l3?.estimatedTokens ?? 0);
    return {
      queryId: compiled.context.queryId,
      levels: { ...compiled.context.levels, l0 },
      totalEstimatedTokens,
    };
  }
}
