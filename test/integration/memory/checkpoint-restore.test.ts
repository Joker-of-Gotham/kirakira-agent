import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import { PostgresStoreAdapter } from "../../../packages/memory-service/src/adapters/postgres-store-adapter.js";
import { CheckpointService } from "../../../packages/memory-service/src/checkpoint/checkpoint-service.js";

import { InMemoryStoreAdapter, MapBlobAdapter } from "../../helpers/memory-test-adapters.js";
import { setupMemoryPostgresHooks, skipIfNoDocker } from "../../helpers/memory-containers.js";

describe.skipIf(skipIfNoDocker())("checkpoint restore (postgres)", () => {
  const hooks = setupMemoryPostgresHooks();

  it("persists small checkpoints inline and restores identical state", async () => {
    const blob = new MapBlobAdapter();
    const blobCfg = { bucket: "cp-test" };
    const store = new PostgresStoreAdapter(hooks.sql);
    const cp = new CheckpointService(blob, blobCfg);
    const runId = randomUUID();

    const ref = await cp.save(
      {
        tenantId: "t-cp",
        runId,
        stepNo: 2,
        state: { phase: "think", counters: { n: 3 } },
        artifactManifest: { artifactIds: [] },
      },
      store,
    );

    const restored = await cp.restore(ref, store);
    expect(restored.checkpoint.stateJson).toEqual({ phase: "think", counters: { n: 3 } });
    expect(restored.checkpoint.runId).toBe(runId);
  });

  it("spills large checkpoints to blob storage and restores byte-identical JSON", async () => {
    const blob = new MapBlobAdapter();
    const blobCfg = { bucket: "cp-test" };
    const store = new PostgresStoreAdapter(hooks.sql);
    const cp = new CheckpointService(blob, blobCfg);
    const runId = randomUUID();
    const huge = { pad: "y".repeat(70_000), nested: { ok: true } };

    const ref = await cp.save(
      {
        tenantId: "t-cp2",
        runId,
        stepNo: 1,
        state: huge,
      },
      store,
    );

    const loaded = await store.loadCheckpointById(ref.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.stateJson["__inline"]).toBe(false);
    expect(typeof loaded!.stateJson["__blobUri"]).toBe("string");

    const restored = await cp.restore(ref, store);
    expect(restored.checkpoint.stateJson).toEqual(huge);
  });
});

describe("checkpoint restore (in-memory)", () => {
  it("round-trips inline and spilled checkpoints without Postgres", async () => {
    const blob = new MapBlobAdapter();
    const blobCfg = { bucket: "cp-local" };
    const store = new InMemoryStoreAdapter();
    const cp = new CheckpointService(blob, blobCfg);
    const runId = randomUUID();

    const refSmall = await cp.save(
      { tenantId: "t-local", runId, stepNo: 0, state: { k: 1 } },
      store,
    );
    const small = await cp.restore(refSmall, store);
    expect(small.checkpoint.stateJson).toEqual({ k: 1 });

    const refLarge = await cp.save(
      { tenantId: "t-local", runId, stepNo: 1, state: { pad: "z".repeat(70_000) } },
      store,
    );
    const large = await cp.restore(refLarge, store);
    expect(large.checkpoint.stateJson).toEqual({ pad: "z".repeat(70_000) });
  });
});
