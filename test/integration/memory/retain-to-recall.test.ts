import { describe, expect, it } from "vitest";

import type { MemoryServiceConfig } from "../../../packages/memory-service/src/config.js";
import { PostgresStoreAdapter } from "../../../packages/memory-service/src/adapters/postgres-store-adapter.js";
import { RecallPipeline } from "../../../packages/memory-service/src/recall/recall-pipeline.js";
import { GraphRecallRoute } from "../../../packages/memory-service/src/recall/routes/graph-route.js";
import { SimilarityRecallRoute } from "../../../packages/memory-service/src/recall/routes/similarity-route.js";
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
});
