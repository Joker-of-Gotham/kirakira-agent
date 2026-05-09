import type {
  ContextBundle,
  ContextLevel,
  ContextL0,
  ContextL1,
  ContextL2,
  ContextL3,
} from "@kirakira/memory-core";
import type { MemoryRecord } from "@kirakira/memory-core";

import { estimateTokensSync } from "./token-estimator.js";

export interface RankedExplanation {
  recordId: string;
  routeReason: string;
  score: number;
}

export interface BudgetCompileResult {
  context: ContextBundle;
  effectiveLevel: ContextLevel;
  degradationReason?: string;
}

export class BudgetCompiler {
  async compile(
    records: MemoryRecord[],
    queryId: string,
    explanations: RankedExplanation[],
    tokenBudget: number,
    level: ContextLevel,
  ): Promise<BudgetCompileResult> {
    const expById = new Map(explanations.map((e) => [e.recordId, e] as const));

    let degrade: string | undefined;
    let effLevel: ContextLevel = level;
    let running = 0;
    const texts: string[] = [];
    for (const r of records) {
      texts.push([r.text, r.summaryL0].filter(Boolean).join("\n"));
    }
    for (const t of texts) {
      running += estimateTokensSync(t);
    }
    if (running > tokenBudget && level === "L3") {
      effLevel = "L2";
      degrade = "budget_exceeded_downgrade_L3_to_L2";
    }
    if (running > tokenBudget && effLevel === "L2") {
      effLevel = "L1";
      degrade = degrade ?? "budget_exceeded_downgrade_to_L1";
    }
    if (running > tokenBudget && effLevel === "L1") {
      effLevel = "L0";
      degrade = degrade ?? "budget_exceeded_downgrade_to_L0";
    }

    const entitySet = new Set<string>();
    for (const r of records) {
      for (const e of r.entityIds) {
        entitySet.add(e);
      }
    }

    const timeFrom = records.map((r) => r.validFrom).find(Boolean);
    const timeTo = records.map((r) => r.validTo).find(Boolean);

    const l0: ContextL0 = {
      level: "L0",
      abstract: `Recall summary for query ${queryId}: ${records.length} records, ${entitySet.size} entities.`,
      entityCount: entitySet.size,
      timeWindow:
        timeFrom || timeTo
          ? { from: timeFrom ?? undefined, to: timeTo ?? undefined }
          : undefined,
      estimatedTokens: estimateTokensSync(
        `Recall summary for query ${queryId}: ${records.length} records, ${entitySet.size} entities.`,
      ),
    };

    const levels: ContextBundle["levels"] = { l0 };

    if (effLevel === "L1" || effLevel === "L2" || effLevel === "L3") {
      const factish = records.filter((r) => r.kind === "fact" || r.kind === "observation");
      const l1: ContextL1 = {
        level: "L1",
        factSummaries: factish.map((r) => r.summaryL0 ?? r.text?.slice(0, 240) ?? r.id),
        stateSummary: records.find((r) => r.kind === "checkpoint")?.summaryL0,
        observationSummaries: records
          .filter((r) => r.kind === "observation")
          .map((o) => o.overviewL1 ?? o.summaryL0 ?? ""),
        estimatedTokens: 0,
      };
      l1.estimatedTokens =
        estimateTokensSync([...l1.factSummaries, ...l1.observationSummaries].join("\n")) +
        estimateTokensSync(l1.stateSummary ?? "");
      levels.l1 = l1;
    }

    if (effLevel === "L2" || effLevel === "L3") {
      const l2: ContextL2 = {
        level: "L2",
        cards: records.slice(0, 24).map((r) => ({
          id: r.id,
          kind: r.kind,
          summary: r.summaryL0 ?? r.text?.slice(0, 200) ?? r.id,
          provenance: r.evidenceIds.join(","),
          routeReason: expById.get(r.id)?.routeReason ?? "unknown",
          score: expById.get(r.id)?.score ?? 0,
        })),
        estimatedTokens: 0,
      };
      l2.estimatedTokens = l2.cards.reduce((acc, c) => acc + estimateTokensSync(c.summary), 0);
      levels.l2 = l2;
    }

    if (effLevel === "L3") {
      const l3: ContextL3 = {
        level: "L3",
        evidence: records.map((r) => ({
          id: r.id,
          sourceRecordId: r.id,
          rawSpan: r.text,
          artifactPointer: typeof r.metadata["artifactUri"] === "string" ? r.metadata["artifactUri"] : undefined,
          graphPath: Array.isArray(r.metadata["_graphPath"]) ? (r.metadata["_graphPath"] as string[]) : undefined,
          checkpointState: r.kind === "checkpoint" ? r.metadata : undefined,
        })),
        estimatedTokens: 0,
      };
      l3.estimatedTokens = l3.evidence.reduce((acc, e) => acc + estimateTokensSync(e.rawSpan ?? ""), 0);
      levels.l3 = l3;
    }

    const total =
      l0.estimatedTokens +
      (levels.l1?.estimatedTokens ?? 0) +
      (levels.l2?.estimatedTokens ?? 0) +
      (levels.l3?.estimatedTokens ?? 0);

    const context: ContextBundle = {
      queryId,
      levels,
      totalEstimatedTokens: total,
    };

    return {
      context,
      effectiveLevel: effLevel,
      ...(degrade !== undefined ? { degradationReason: degrade } : {}),
    };
  }
}
