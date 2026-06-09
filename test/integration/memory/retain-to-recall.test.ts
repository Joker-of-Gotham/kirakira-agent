import { describe, expect, it } from "vitest";

import type { MemoryServiceConfig } from "../../../packages/memory-service/src/config.js";
import { PostgresStoreAdapter } from "../../../packages/memory-service/src/adapters/postgres-store-adapter.js";
import { RecallPipeline } from "../../../packages/memory-service/src/recall/recall-pipeline.js";
import { GraphRecallRoute } from "../../../packages/memory-service/src/recall/routes/graph-route.js";
import { SimilarityRecallRoute } from "../../../packages/memory-service/src/recall/routes/similarity-route.js";
import { ReflectPipeline } from "../../../packages/memory-service/src/reflect/reflect-pipeline.js";
import { RetainPipeline } from "../../../packages/memory-service/src/retain/retain-pipeline.js";
import { resolveEpisodeBodyUri } from "../../../packages/memory-service/src/adapters/s3-blob-adapter.js";

import {
  GraphFixtureStub,
  HashEmbeddingClient,
  InMemoryStoreAdapter,
  MapBlobAdapter,
  TenantVectorStub,
} from "../../helpers/memory-test-adapters.js";
import { setupMemoryPostgresHooks, skipIfNoDocker } from "../../helpers/memory-containers.js";

describe("retain-to-recall (in-memory)", () => {
  it("retains markdown episodes then recalls them via similarity + fusion", async () => {
    const blob = new MapBlobAdapter();
    const blobCfg = { bucket: "integration-test" };
    const store = new InMemoryStoreAdapter();
    const vector = new TenantVectorStub();
    const graph = new GraphFixtureStub([]);
    const embedding = new HashEmbeddingClient(32);

    const serviceCfg = {
      recall: { defaultTokenBudget: 8192, similarityWeight: 1, temporalWeight: 0.5, stateWeight: 0.5 },
    } as MemoryServiceConfig;

    const retain = new RetainPipeline({ blob, blobConfig: blobCfg, serviceConfig: serviceCfg });
    const receipt = await retain.run(
      {
        tenantId: "t1",
        workspaceId: "w1",
        namespace: "project",
        sourceType: "chat",
        content: "The deployment requires rolling restarts and health checks after each wave.",
        metadata: { topic: "ops" },
      },
      store,
    );

    for (const id of receipt.memoryRecordIds) {
      vector.register("t1", id);
    }

    const recall = new RecallPipeline({
      routes: [
        new SimilarityRecallRoute(1, vector, store),
        new GraphRecallRoute(0.5, graph, store),
      ],
      embedding,
      serviceConfig: serviceCfg,
    });

    const bundle = await recall.run({
      tenantId: "t1",
      workspaceId: "w1",
      query: "rolling restarts deployment",
      limit: 8,
      level: "L2",
    });

    expect(bundle.recordIds.some((id) => receipt.memoryRecordIds.includes(id))).toBe(true);
    expect(bundle.context.levels.l0.level).toBe("L0");

    const bodyUri = resolveEpisodeBodyUri(blobCfg, "t1", receipt.episodeId);
    const obj = await blob.get(bodyUri);
    expect(obj).not.toBeNull();
    expect(obj!.body.toString("utf8")).toContain("rolling restarts");
  });
});

describe.skipIf(skipIfNoDocker())("retain-to-recall (postgres)", () => {
  const hooks = setupMemoryPostgresHooks();

  it("uses real Postgres store for retain + recall pipeline", async () => {
    const blob = new MapBlobAdapter();
    const blobCfg = { bucket: "integration-test" };
    const store = new PostgresStoreAdapter(hooks.sql);
    const vector = new TenantVectorStub();
    const graph = new GraphFixtureStub([]);
    const embedding = new HashEmbeddingClient(32);
    const serviceCfg = {
      recall: { defaultTokenBudget: 8192, similarityWeight: 1, temporalWeight: 0.5, stateWeight: 0.5 },
    } as MemoryServiceConfig;

    const retain = new RetainPipeline({ blob, blobConfig: blobCfg, serviceConfig: serviceCfg });
    const receipt = await retain.run(
      {
        tenantId: "tenant-pg",
        workspaceId: "ws-pg",
        namespace: "project",
        sourceType: "tool",
        content: "Fact: the Northwind contract renews automatically unless cancelled 30 days prior.",
      },
      store,
    );

    for (const id of receipt.memoryRecordIds) {
      vector.register("tenant-pg", id);
    }

    const recall = new RecallPipeline({
      routes: [
        new SimilarityRecallRoute(1, vector, store),
        new GraphRecallRoute(0.5, graph, store),
      ],
      embedding,
      serviceConfig: serviceCfg,
    });

    const bundle = await recall.run({
      tenantId: "tenant-pg",
      workspaceId: "ws-pg",
      query: "Northwind contract renewal",
      limit: 8,
    });

    expect(bundle.recordIds.some((id) => receipt.memoryRecordIds.includes(id))).toBe(true);
  });

  it("persists reflect observations, beliefs, and outbox rows after retain", async () => {
    const blob = new MapBlobAdapter();
    const blobCfg = { bucket: "integration-test" };
    const store = new PostgresStoreAdapter(hooks.sql);
    const serviceCfg = {
      retain: { factBaseConfidence: 0.8, factConfidenceStep: 0.05 },
    } as MemoryServiceConfig;
    const retain = new RetainPipeline({ blob, blobConfig: blobCfg, serviceConfig: serviceCfg });
    const receipt = await retain.run(
      {
        tenantId: "tenant-reflect-pg",
        workspaceId: "ws-reflect-pg",
        namespace: "project",
        sourceType: "chat",
        content: "Fact: the memory persistence smoke requires durable reflect observations and beliefs.",
        metadata: { subject: "memory-persistence-smoke" },
      },
      store,
    );

    expect(receipt.factIds.length).toBeGreaterThan(0);

    const reflect = new ReflectPipeline();
    const reflected = await reflect.run(
      {
        tenantId: "tenant-reflect-pg",
        workspaceId: "ws-reflect-pg",
        scope: "memory-store-smoke",
        factIds: receipt.factIds,
        maxConsolidations: 1,
      },
      store,
    );

    expect(reflected.observationIds).toHaveLength(1);
    expect(reflected.beliefUpdates).toHaveLength(1);

    const observation = await store.getRecord(reflected.observationIds[0]!);
    const belief = await store.getRecord(reflected.beliefUpdates[0]!.beliefId);
    const outbox = await store.claimOutboxEvents(50);

    expect(observation).toMatchObject({
      kind: "observation",
      tenantId: "tenant-reflect-pg",
      workspaceId: "ws-reflect-pg",
    });
    expect(observation?.metadata.factIds).toEqual(expect.arrayContaining(receipt.factIds));
    expect(belief).toMatchObject({
      kind: "belief",
      tenantId: "tenant-reflect-pg",
      workspaceId: "ws-reflect-pg",
    });
    expect(outbox).toContainEqual(
      expect.objectContaining({
        aggregateType: "memory_reflect",
        aggregateId: reflected.observationIds[0],
        eventType: "memory.observation.created",
      }),
    );
  });
});
