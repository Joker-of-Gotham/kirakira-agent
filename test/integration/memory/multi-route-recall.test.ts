import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MemoryCheckpoint, MemoryRecord } from "@kirakira/memory-core";

import type { MemoryServiceConfig } from "../../../packages/memory-service/src/config.js";
import { RecallPipeline } from "../../../packages/memory-service/src/recall/recall-pipeline.js";
import { GraphRecallRoute } from "../../../packages/memory-service/src/recall/routes/graph-route.js";
import { SimilarityRecallRoute } from "../../../packages/memory-service/src/recall/routes/similarity-route.js";
import { StateLookupRecallRoute } from "../../../packages/memory-service/src/recall/routes/state-lookup-route.js";
import { TemporalRecallRoute } from "../../../packages/memory-service/src/recall/routes/temporal-route.js";

import {
  GraphFixtureStub,
  HashEmbeddingClient,
  InMemoryStoreAdapter,
  TenantVectorStub,
} from "../../helpers/memory-test-adapters.js";

describe("multi-route recall fusion", () => {
  it("runs similarity, graph, temporal, and state routes in parallel", async () => {
    const store = new InMemoryStoreAdapter();
    const vector = new TenantVectorStub();
    const embedding = new HashEmbeddingClient(24);
    const entityId = randomUUID();
    const runId = randomUUID();

    const now = new Date().toISOString();
    const recordId = randomUUID();

    const rec: MemoryRecord = {
      id: recordId,
      tenantId: "mt",
      workspaceId: "mw",
      namespace: "project",
      kind: "fact",
      text: `Policy ${entityId} requires approvals for budget moves in Q2 2026.`,
      summaryL0: "policy",
      metadata: {},
      evidenceIds: [],
      entityIds: [entityId],
      validFrom: "2026-04-01T00:00:00.000Z",
      validTo: "2026-09-30T00:00:00.000Z",
      txFrom: now,
      retentionClass: "default",
      piiLevel: "none",
      redacted: false,
      createdAt: now,
    };
    await store.insertRecord(rec);
    vector.register("mt", recordId);

    const cp: MemoryCheckpoint = {
      id: randomUUID(),
      tenantId: "mt",
      runId,
      stepNo: 1,
      stateJson: { lane: "recall-demo" },
      artifactManifest: {},
      createdAt: now,
    };
    await store.saveCheckpoint(cp);

    const graph = new GraphFixtureStub([recordId]);

    const serviceCfg = {
      recall: {
        defaultTokenBudget: 8192,
        similarityWeight: 1,
        graphWeight: 1,
        temporalWeight: 1,
        stateWeight: 1,
      },
    } as MemoryServiceConfig;

    const routes = [
      new SimilarityRecallRoute(1, vector, store),
      new GraphRecallRoute(1, graph, store),
      new TemporalRecallRoute(1, store),
      new StateLookupRecallRoute(1, store),
    ];

    const pipeline = new RecallPipeline({ routes, embedding, serviceConfig: serviceCfg });

    const bundle = await pipeline.run({
      tenantId: "mt",
      workspaceId: "mw",
      query: `${entityId} approvals and checkpoints for Q2 2026 last month`,
      runId,
      tokenBudget: 8192,
      limit: 12,
      level: "L3",
      timeWindow: {
        from: "2026-04-01T00:00:00.000Z",
        to: "2026-06-30T00:00:00.000Z",
      },
    });

    const routeNames = new Set(bundle.trace.routes.map((r) => r.routeName));
    expect(routeNames.has("similarity")).toBe(true);
    expect(routeNames.has("graph")).toBe(true);
    expect(routeNames.has("temporal")).toBe(true);
    expect(routeNames.has("state")).toBe(true);

    expect(bundle.recordIds).toContain(recordId);
    expect(bundle.context.levels.l2).toBeDefined();
    expect(bundle.context.levels.l3?.evidence.length).toBeGreaterThan(0);
  });
});
