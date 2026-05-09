import type { MemoryRecord, ReflectReceipt, ReflectRequest, StoreAdapter } from "@kirakira/memory-core";

import { randomUUID } from "node:crypto";

import { BeliefManager, type BeliefManagerConfig, type BeliefUpdate } from "./belief-manager.js";
import { ContradictionResolver, type ContradictionResolverConfig } from "./contradiction-resolver.js";
import { ConsolidationScheduler } from "./consolidation-scheduler.js";

export interface ReflectPipelineConfig {
  belief?: BeliefManagerConfig;
  contradiction?: ContradictionResolverConfig;
}

function groupKeyForFact(f: MemoryRecord): string {
  if (f.entityIds.length > 0) return `entity:${f.entityIds[0]}`;
  const sub = typeof f.metadata["subject"] === "string" ? f.metadata["subject"] : "";
  if (sub) return `subject:${sub}`;
  return "topic:default";
}

export class ReflectPipeline {
  private readonly beliefs: BeliefManager;
  private readonly contradictions: ContradictionResolver;
  private readonly scheduler = new ConsolidationScheduler();

  constructor(config?: ReflectPipelineConfig) {
    this.beliefs = new BeliefManager(config?.belief);
    this.contradictions = new ContradictionResolver(config?.contradiction);
  }

  /**
   * Reflect pass: consolidate facts, refresh beliefs, resolve contradictions. Caller supplies a transactional {@link StoreAdapter} when needed.
   */
  async run(req: ReflectRequest, store: StoreAdapter): Promise<ReflectReceipt> {
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const limit = 500;
    const baseFilter = {
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      kinds: ["fact"] as const,
      limit,
      tombstoned: false,
    };

    let facts = await store.queryRecords({
      ...baseFilter,
      kinds: ["fact"],
    });

    if (req.factIds && req.factIds.length > 0) {
      const allow = new Set(req.factIds);
      facts = facts.filter((f) => allow.has(f.id));
    }

    if (req.episodeIds && req.episodeIds.length > 0) {
      const eps = new Set(req.episodeIds);
      facts = facts.filter((f) => eps.has(String(f.metadata["sourceEpisodeId"])));
    }

    const scopePrefix = req.scope ? `${req.scope}:` : "";
    const groups = new Map<string, MemoryRecord[]>();
    for (const f of facts) {
      const k = scopePrefix + groupKeyForFact(f);
      const arr = groups.get(k) ?? [];
      arr.push(f);
      groups.set(k, arr);
    }

    const observationIds: string[] = [];
    const beliefUpdates: BeliefUpdate[] = [];
    const contradictionRows: ReflectReceipt["contradictions"] = [];

    const maxGroups = this.scheduler.maxGroupsPerRun(req.maxConsolidations);
    let processed = 0;

    for (const [, cluster] of groups) {
      if (processed >= maxGroups) break;
      if (cluster.length === 0) continue;

      const oldest = cluster.reduce((a, b) => (Date.parse(a.createdAt) < Date.parse(b.createdAt) ? a : b));
      if (
        !this.scheduler.shouldConsolidate(cluster.length, 86_400_000, oldest.createdAt, nowMs) &&
        !(req.factIds && req.factIds.length > 0)
      ) {
        continue;
      }

      processed += 1;

      const pairs = this.contradictions.detectContradictions(cluster);
      for (const { a, b } of pairs) {
        const res = this.contradictions.resolvePair(a, b);
        contradictionRows.push({
          factId: res.winnerId,
          conflictsWith: res.loserId,
          resolution: res.reason,
        });
        await store.tombstoneRecord(res.loserId, res.reason);
      }

      const obsId = randomUUID();
      const summary =
        cluster
          .map((c) => c.summaryL0 ?? c.text?.slice(0, 120) ?? "")
          .filter(Boolean)
          .slice(0, 8)
          .join(" | ") || "consolidated observation";

      const observation: MemoryRecord = {
        id: obsId,
        tenantId: req.tenantId,
        workspaceId: req.workspaceId,
        namespace: cluster[0]!.namespace,
        kind: "observation",
        text: summary,
        summaryL0: summary.slice(0, 200),
        overviewL1: summary,
        metadata: { factIds: cluster.map((c) => c.id) },
        confidence: Number(
          (
            cluster.reduce((acc, c) => acc + (typeof c.confidence === "number" ? c.confidence : 0.7), 0) /
            cluster.length
          ).toFixed(4),
        ),
        evidenceIds: cluster.map((c) => c.id),
        entityIds: [...new Set(cluster.flatMap((c) => c.entityIds))],
        txFrom: nowIso,
        retentionClass: cluster[0]!.retentionClass,
        piiLevel: cluster[0]!.piiLevel,
        redacted: false,
        createdAt: nowIso,
      };

      await store.insertRecord(observation);
      observationIds.push(obsId);

      const belief = this.beliefs.createBeliefFromFacts(cluster, nowIso);
      await store.insertRecord(belief);
      beliefUpdates.push({ beliefId: belief.id, action: "created" });

      await store.pushOutboxEvent({
        tenantId: req.tenantId,
        aggregateType: "memory_reflect",
        aggregateId: obsId,
        eventType: "memory.observation.created",
        payload: {
          observationId: obsId,
          beliefId: belief.id,
          factIds: cluster.map((c) => c.id),
        },
        availableAt: nowIso,
      });
    }

    return {
      observationIds,
      beliefUpdates,
      contradictions: contradictionRows,
      reflectedAt: nowIso,
    };
  }
}
