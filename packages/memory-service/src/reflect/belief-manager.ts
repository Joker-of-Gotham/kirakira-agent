import type { MemoryRecord } from "@kirakira/memory-core";

import { randomUUID } from "node:crypto";

export interface BeliefUpdate {
  beliefId: string;
  action: "created" | "updated" | "invalidated";
}

export interface BeliefManagerConfig {
  defaultConfidence?: number;
  supportDelta?: number;
  contradictDelta?: number;
  supportCountBoost?: number;
}

/**
 * Tracks belief confidence from supporting / refuting {@link MemoryRecord} facts and materializes new belief rows.
 */
export class BeliefManager {
  private readonly defaultConf: number;
  private readonly supportDelta: number;
  private readonly contradictDelta: number;
  private readonly supportBoost: number;

  constructor(config?: BeliefManagerConfig) {
    this.defaultConf = config?.defaultConfidence ?? 0.7;
    this.supportDelta = config?.supportDelta ?? 0.12;
    this.contradictDelta = config?.contradictDelta ?? 0.18;
    this.supportBoost = config?.supportCountBoost ?? 0.05;
  }

  createBeliefFromFacts(cluster: MemoryRecord[], nowIso: string): MemoryRecord {
    const id = randomUUID();
    const statement =
      cluster
        .map((f) => f.text ?? f.summaryL0 ?? "")
        .filter(Boolean)
        .slice(0, 5)
        .join(" · ") || "consolidated belief";

    const support = cluster.map((f) => f.id);
    const avgConf =
      cluster.reduce((acc, f) => acc + (typeof f.confidence === "number" ? f.confidence : this.defaultConf), 0) /
      Math.max(1, cluster.length);

    return {
      id,
      tenantId: cluster[0]!.tenantId,
      workspaceId: cluster[0]!.workspaceId,
      namespace: cluster[0]!.namespace,
      kind: "belief",
      text: statement,
      summaryL0: statement.slice(0, 200),
      metadata: { derivedFromFactIds: support },
      confidence: Math.min(1, Number((avgConf + this.supportBoost * Math.min(support.length, 4)).toFixed(4))),
      evidenceIds: support,
      entityIds: [...new Set(cluster.flatMap((c) => c.entityIds))],
      txFrom: nowIso,
      retentionClass: cluster[0]!.retentionClass,
      piiLevel: cluster[0]!.piiLevel,
      redacted: false,
      createdAt: nowIso,
    };
  }

  adjustConfidenceForEvidence(
    belief: MemoryRecord,
    supportCount: number,
    refuteCount: number,
    nowIso: string,
  ): MemoryRecord {
    const base = typeof belief.confidence === "number" ? belief.confidence : this.defaultConf;
    const next = Math.max(
      0.05,
      Math.min(0.99, base + this.supportDelta * supportCount - this.contradictDelta * refuteCount),
    );
    return {
      ...belief,
      confidence: Number(next.toFixed(4)),
      txFrom: nowIso,
    };
  }
}
