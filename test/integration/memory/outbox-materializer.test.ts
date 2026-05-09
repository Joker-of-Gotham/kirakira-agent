import { describe, expect, it } from "vitest";

import type { MemoryServiceConfig } from "../../../packages/memory-service/src/config.js";
import { PostgresStoreAdapter } from "../../../packages/memory-service/src/adapters/postgres-store-adapter.js";
import { RetainPipeline } from "../../../packages/memory-service/src/retain/retain-pipeline.js";

import { InMemoryStoreAdapter, MapBlobAdapter } from "../../helpers/memory-test-adapters.js";
import { setupMemoryPostgresHooks, skipIfNoDocker } from "../../helpers/memory-containers.js";

const blobCfg = { bucket: "outbox-test" };

function minimalServiceConfig(): MemoryServiceConfig {
  return { recall: { defaultTokenBudget: 4096 } } as MemoryServiceConfig;
}

describe("outbox materializer (in-memory)", () => {
  it("emits fact extraction and index materialization events with stable shapes", async () => {
    const store = new InMemoryStoreAdapter();
    const blob = new MapBlobAdapter();
    const retain = new RetainPipeline({ blob, blobConfig: blobCfg, serviceConfig: minimalServiceConfig() });

    await retain.run(
      {
        tenantId: "t-ob",
        workspaceId: "w-ob",
        namespace: "project",
        sourceType: "chat",
        content: "Key insight: the metric is defined as revenue divided by active accounts.",
      },
      store,
    );

    const events = store.peekOutbox();
    const types = events.map((e) => e.eventType);
    expect(types).toContain("memory.fact.extract");
    expect(types).toContain("memory.index.materialize");

    const extract = events.find((e) => e.eventType === "memory.fact.extract");
    expect(extract?.aggregateType).toBe("memory_episode");
    expect(typeof extract?.payload["episodeId"]).toBe("string");
    expect(typeof extract?.payload["segmentId"]).toBe("string");

    const materialize = events.find((e) => e.eventType === "memory.index.materialize");
    const recordIds = materialize?.payload["recordIds"];
    expect(Array.isArray(recordIds)).toBe(true);
    expect((recordIds as string[]).length).toBeGreaterThan(0);
  });
});

describe.skipIf(skipIfNoDocker())("outbox materializer (postgres)", () => {
  const hooks = setupMemoryPostgresHooks();

  it("persists outbox rows consumable by the dispatcher pipeline", async () => {
    const store = new PostgresStoreAdapter(hooks.sql);
    const blob = new MapBlobAdapter();
    const retain = new RetainPipeline({ blob, blobConfig: blobCfg, serviceConfig: minimalServiceConfig() });

    await retain.run(
      {
        tenantId: "t-ob-pg",
        workspaceId: "w-ob-pg",
        namespace: "org",
        sourceType: "file",
        content: "Compliance note: data residency is EU-only for this workspace.",
      },
      store,
    );

    const pending = await store.claimOutboxEvents(16);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    expect(pending.some((e) => e.eventType === "memory.fact.extract")).toBe(true);
    expect(pending.some((e) => e.eventType === "memory.index.materialize")).toBe(true);
  });
});
