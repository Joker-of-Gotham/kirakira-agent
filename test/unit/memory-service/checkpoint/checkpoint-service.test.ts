import { describe, expect, it, vi } from "vitest";
import type { BlobAdapter, CheckpointRef, MemoryCheckpoint, StoreAdapter } from "@kirakira/memory-core";

import { CheckpointService } from "../../../../packages/memory-service/src/checkpoint/checkpoint-service.js";
import type { BlobConfig } from "../../../../packages/memory-service/src/adapters/s3-blob-adapter.js";

function createStoreStub(overrides: Partial<StoreAdapter> = {}): StoreAdapter {
  const stub = {
    insertRecord: vi.fn<StoreAdapter["insertRecord"]>().mockResolvedValue(undefined),
    insertRecords: vi.fn<StoreAdapter["insertRecords"]>().mockResolvedValue(undefined),
    getRecord: vi.fn<StoreAdapter["getRecord"]>().mockResolvedValue(null),
    queryRecords: vi.fn<StoreAdapter["queryRecords"]>().mockResolvedValue([]),
    tombstoneRecord: vi.fn<StoreAdapter["tombstoneRecord"]>().mockResolvedValue(undefined),
    tombstoneRecords: vi.fn<StoreAdapter["tombstoneRecords"]>().mockResolvedValue(undefined),
    insertEpisode: vi.fn<StoreAdapter["insertEpisode"]>().mockResolvedValue(undefined),
    getEpisode: vi.fn<StoreAdapter["getEpisode"]>().mockResolvedValue(null),
    queryEpisodes: vi.fn<StoreAdapter["queryEpisodes"]>().mockResolvedValue([]),
    saveCheckpoint: vi.fn<StoreAdapter["saveCheckpoint"]>().mockResolvedValue(undefined),
    loadCheckpoint: vi.fn<StoreAdapter["loadCheckpoint"]>().mockResolvedValue(null),
    loadCheckpointById: vi.fn<StoreAdapter["loadCheckpointById"]>().mockResolvedValue(null),
    listCheckpoints: vi.fn<StoreAdapter["listCheckpoints"]>().mockResolvedValue([]),
    insertArtifactMeta: vi.fn<StoreAdapter["insertArtifactMeta"]>().mockResolvedValue(undefined),
    getArtifactMeta: vi.fn<StoreAdapter["getArtifactMeta"]>().mockResolvedValue(null),
    pushOutboxEvent: vi.fn<StoreAdapter["pushOutboxEvent"]>().mockResolvedValue(""),
    claimOutboxEvents: vi.fn<StoreAdapter["claimOutboxEvents"]>().mockResolvedValue([]),
    completeOutboxEvent: vi.fn<StoreAdapter["completeOutboxEvent"]>().mockResolvedValue(undefined),
    failOutboxEvent: vi.fn<StoreAdapter["failOutboxEvent"]>().mockResolvedValue(undefined),
    createDeletionJob: vi.fn<StoreAdapter["createDeletionJob"]>().mockResolvedValue(""),
    updateDeletionJob: vi.fn<StoreAdapter["updateDeletionJob"]>().mockResolvedValue(undefined),
    runMigrations: vi.fn<StoreAdapter["runMigrations"]>().mockResolvedValue(undefined),
    close: vi.fn<StoreAdapter["close"]>().mockResolvedValue(undefined),
  };
  return { ...stub, ...overrides } as StoreAdapter;
}

describe("CheckpointService", () => {
  const blobCfg: BlobConfig = { bucket: "unit-test-bucket" };

  it("stores small state inline without touching blob storage", async () => {
    const blob = {
      put: vi.fn<BlobAdapter["put"]>(),
      get: vi.fn<BlobAdapter["get"]>(),
      head: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      setWormRetention: vi.fn(),
      setLegalHold: vi.fn(),
      close: vi.fn(),
    };
    const store = createStoreStub();

    const svc = new CheckpointService(blob as unknown as BlobAdapter, blobCfg);
    await svc.save(
      {
        tenantId: "tenant-a",
        runId: "run-1",
        stepNo: 3,
        state: { counters: { n: 1 } },
      },
      store,
    );

    expect(blob.put).not.toHaveBeenCalled();
    expect(store.saveCheckpoint).toHaveBeenCalledTimes(1);
    const saved: MemoryCheckpoint = vi.mocked(store.saveCheckpoint).mock.calls[0]![0];
    expect(saved.stateJson).toEqual({ counters: { n: 1 } });
  });

  it("spills oversized state to the blob adapter", async () => {
    const blob = {
      put: vi.fn<BlobAdapter["put"]>().mockResolvedValue(undefined),
      get: vi.fn<BlobAdapter["get"]>(),
      head: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      setWormRetention: vi.fn(),
      setLegalHold: vi.fn(),
      close: vi.fn(),
    };
    const store = createStoreStub();

    const svc = new CheckpointService(blob as unknown as BlobAdapter, blobCfg);
    const huge = { pad: "x".repeat(70_000) };
    await svc.save({ tenantId: "tenant-b", runId: "run-2", stepNo: 1, state: huge }, store);

    expect(blob.put).toHaveBeenCalledTimes(1);
    expect(store.saveCheckpoint).toHaveBeenCalled();
    const saved: MemoryCheckpoint = vi.mocked(store.saveCheckpoint).mock.calls[0]![0];
    expect(saved.stateJson.__inline).toBe(false);
    expect(typeof saved.stateJson.__blobUri).toBe("string");
  });

  it("throws when a checkpoint id is missing", async () => {
    const store = createStoreStub();
    vi.mocked(store.loadCheckpointById).mockResolvedValue(null);

    const svc = new CheckpointService({} as BlobAdapter, blobCfg);
    const ref: CheckpointRef = { id: "missing", runId: "r", stepNo: 1, createdAt: new Date().toISOString() };
    await expect(svc.restore(ref, store)).rejects.toMatchObject({ code: "CHECKPOINT_NOT_FOUND" });
  });

  it("rehydrates spilled JSON from blob storage", async () => {
    const payload = { restored: true, values: [1, 2, 3] };
    const uri = "s3://unit-test-bucket/tenants/t1/checkpoints/abc.json";
    const blob = {
      put: vi.fn(),
      get: vi.fn<BlobAdapter["get"]>().mockImplementation(async (u) => {
        if (u !== uri) return null;
        return {
          uri,
          body: Buffer.from(JSON.stringify(payload), "utf8"),
          metadata: { contentType: "application/json", sha256: "", size: 10 },
        };
      }),
      head: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      setWormRetention: vi.fn(),
      setLegalHold: vi.fn(),
      close: vi.fn(),
    };

    const row: MemoryCheckpoint = {
      id: "cp-1",
      tenantId: "t1",
      runId: "run-z",
      stepNo: 2,
      stateJson: { __blobUri: uri, __inline: false, __bytes: 128 },
      artifactManifest: {},
      createdAt: "2026-05-06T12:00:00.000Z",
    };
    const store = createStoreStub();
    vi.mocked(store.loadCheckpointById).mockResolvedValue(row);

    const svc = new CheckpointService(blob as unknown as BlobAdapter, blobCfg);
    const restored = await svc.restore(
      { id: "cp-1", runId: "run-z", stepNo: 2, createdAt: row.createdAt },
      store,
    );

    expect(blob.get).toHaveBeenCalledWith(uri);
    expect(restored.checkpoint.stateJson).toEqual(payload);
  });
});
