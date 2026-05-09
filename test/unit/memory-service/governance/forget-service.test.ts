import { describe, expect, it, vi } from "vitest";
import type {
  CacheAdapter,
  ForgetRequest,
  GraphAdapter,
  StoreAdapter,
  VectorAdapter,
} from "@kirakira/memory-core";

import { ForgetService } from "../../../../packages/memory-service/src/governance/forget-service.js";
import { makeRecord } from "../_helpers.js";

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

describe("ForgetService.forget", () => {
  const collection = "memory-vectors";

  function makeDeps() {
    return {
      vector: {
        delete: vi.fn<VectorAdapter["delete"]>().mockResolvedValue(3),
        ensureCollection: vi.fn(),
        deleteCollection: vi.fn(),
        listCollections: vi.fn(),
        upsert: vi.fn(),
        search: vi.fn(),
        createSnapshot: vi.fn(),
        close: vi.fn(),
      },
      graph: {
        invalidateEdges: vi.fn<GraphAdapter["invalidateEdges"]>().mockResolvedValue(undefined),
        ensureSchema: vi.fn(),
        upsertNode: vi.fn(),
        upsertNodes: vi.fn(),
        upsertEdge: vi.fn(),
        upsertEdges: vi.fn(),
        getNode: vi.fn(),
        traverse: vi.fn(),
        findNeighbors: vi.fn(),
        invalidateEdge: vi.fn(),
        deleteNode: vi.fn(),
        deleteNodes: vi.fn(),
        close: vi.fn(),
      },
      cache: {
        deletePattern: vi.fn<CacheAdapter["deletePattern"]>().mockResolvedValue(12),
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        acquireLock: vi.fn(),
        releaseLock: vi.fn(),
        extendLock: vi.fn(),
        publishToStream: vi.fn(),
        consumeStream: vi.fn(),
        ackStream: vi.fn(),
        createConsumerGroup: vi.fn(),
        close: vi.fn(),
      },
      vectorCollections: [collection],
    };
  }

  const baseReq = (): ForgetRequest => ({
    tenantId: "tenant-1",
    workspaceId: "ws-1",
    reason: "gdpr",
    recordIds: ["r1", "r2", "r3"],
  });

  it("lists tombstone targets on dry runs without mutating storage", async () => {
    const deps = makeDeps();
    const service = new ForgetService(deps as never);
    const store = createStoreStub();
    const receipt = await service.forget({ ...baseReq(), dryRun: true }, store);

    expect(receipt.dryRun).toBe(true);
    expect(receipt.tombstonedIds).toEqual(["r1", "r2", "r3"]);
    expect(store.tombstoneRecords).not.toHaveBeenCalled();
    expect(deps.vector.delete).not.toHaveBeenCalled();
  });

  it("tombstones explicit ids and clears auxiliary indexes", async () => {
    const deps = makeDeps();
    const service = new ForgetService(deps as never);
    const store = createStoreStub();
    await service.forget(baseReq(), store);

    expect(store.tombstoneRecords).toHaveBeenCalledWith(["r1", "r2", "r3"], "gdpr");
    expect(deps.vector.delete).toHaveBeenCalledWith(collection, { sourceRecordIds: ["r1", "r2", "r3"] });
    expect(deps.graph.invalidateEdges).toHaveBeenCalledTimes(3);
    expect(deps.cache.deletePattern).toHaveBeenCalledWith("memory:tenant-1:ws-1:*");
    expect(store.createDeletionJob).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        recordIds: ["r1", "r2", "r3"],
        reason: "gdpr",
      }),
    );
  });

  it("limits deletions to rows created before the cutoff when ids are omitted", async () => {
    const deps = makeDeps();
    const service = new ForgetService(deps as never);
    const store = createStoreStub();
    vi.mocked(store.queryRecords).mockResolvedValue([
      makeRecord({ id: "old", createdAt: "2026-01-01T00:00:00.000Z", tenantId: "tenant-1", workspaceId: "ws-1" }),
      makeRecord({ id: "new", createdAt: "2026-06-01T00:00:00.000Z", tenantId: "tenant-1", workspaceId: "ws-1" }),
    ]);

    await service.forget(
      {
        tenantId: "tenant-1",
        workspaceId: "ws-1",
        reason: "retention",
        beforeDate: "2026-05-01T00:00:00.000Z",
      },
      store,
    );

    expect(deps.vector.delete).toHaveBeenCalledWith(collection, { sourceRecordIds: ["old"] });
  });
});
