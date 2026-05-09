import type {
  CacheAdapter,
  ForgetReceipt,
  ForgetRequest,
  GraphAdapter,
  StoreAdapter,
  VectorAdapter,
} from "@kirakira/memory-core";

export class ForgetService {
  constructor(
    private readonly deps: {
      vector: VectorAdapter;
      graph: GraphAdapter;
      cache: CacheAdapter;
      vectorCollections: readonly string[];
    },
  ) {}

  async forget(req: ForgetRequest, store: StoreAdapter): Promise<ForgetReceipt> {
    const nowIso = new Date().toISOString();

    let ids = [...(req.recordIds ?? [])];
    if (ids.length === 0 && req.beforeDate) {
      const rows = await store.queryRecords({
        tenantId: req.tenantId,
        workspaceId: req.workspaceId,
        namespace: req.namespace,
        limit: 2000,
      });
      const cut = Date.parse(req.beforeDate);
      ids = rows.filter((r) => Date.parse(r.createdAt) <= cut).map((r) => r.id);
    }

    if (req.dryRun) {
      return {
        tombstonedIds: ids,
        indexesDeleted: 0,
        cacheKeysEvicted: 0,
        graphEdgesInvalidated: 0,
        dryRun: true,
        forgotAt: nowIso,
      };
    }

    if (ids.length > 0) {
      await store.tombstoneRecords(ids, req.reason);
    }

    let indexesDeleted = 0;
    if (ids.length > 0) {
      for (const col of this.deps.vectorCollections) {
        indexesDeleted += await this.deps.vector.delete(col, { sourceRecordIds: ids });
      }
    }

    let graphEdgesInvalidated = 0;
    const exp = nowIso;
    for (const id of ids) {
      await this.deps.graph.invalidateEdges(id, undefined, exp);
      graphEdgesInvalidated += 1;
    }

    const pattern = `memory:${req.tenantId}:${req.workspaceId}:*`;
    const cacheKeysEvicted = await this.deps.cache.deletePattern(pattern);

    if (ids.length > 0) {
      await store.createDeletionJob({
        tenantId: req.tenantId,
        recordIds: ids,
        reason: req.reason,
      });
    }

    return {
      tombstonedIds: ids,
      indexesDeleted,
      cacheKeysEvicted,
      graphEdgesInvalidated,
      dryRun: false,
      forgotAt: nowIso,
    };
  }
}
