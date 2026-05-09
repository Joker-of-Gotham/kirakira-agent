import type {
  HybridSearchParams,
  VectorAdapter,
  VectorDeleteFilter,
  VectorSearchResult,
  VectorUpsertItem,
} from "@kirakira/memory-core";
import { VectorAdapterError } from "@kirakira/memory-core";
import type { QdrantClient } from "@qdrant/js-client-rest";
import type { MemoryVectorFilter } from "../types.js";
import { QdrantCollectionManager } from "./collection-manager.js";
import { QdrantSearchService } from "./search.js";
import { QdrantSnapshotService } from "./snapshot.js";
import { QdrantUpsertService } from "./upsert.js";

function parseMemoryFilter(
  raw: Record<string, unknown> | undefined,
): MemoryVectorFilter {
  const tenant = raw?.["tenant_id"];
  if (typeof tenant !== "string" || tenant.length === 0) {
    throw new VectorAdapterError(
      "Vector search filter must include string tenant_id",
    );
  }
  const eids = raw?.["entity_ids"];
  const entity_ids = Array.isArray(eids)
    ? eids.filter((x): x is string => typeof x === "string")
    : undefined;

  return { tenant_id: tenant, entity_ids };
}

export class QdrantAdapter implements VectorAdapter {
  private readonly client: QdrantClient;
  private readonly collections: QdrantCollectionManager;
  private readonly searchSvc: QdrantSearchService;
  private readonly upsertSvc: QdrantUpsertService;
  private readonly snapshotSvc: QdrantSnapshotService;

  constructor(client: QdrantClient) {
    this.client = client;
    this.collections = new QdrantCollectionManager(client);
    this.searchSvc = new QdrantSearchService(client);
    this.upsertSvc = new QdrantUpsertService(client);
    this.snapshotSvc = new QdrantSnapshotService(client);
  }

  ensureCollection(
    name: string,
    dimension: number,
    hasSparse?: boolean,
  ): Promise<void> {
    return this.collections.ensureCollection(name, dimension, hasSparse);
  }

  deleteCollection(name: string): Promise<void> {
    return this.collections.deleteCollection(name);
  }

  listCollections(): Promise<string[]> {
    return this.collections.listCollections();
  }

  upsert(collection: string, items: VectorUpsertItem[]): Promise<void> {
    return this.upsertSvc.upsert(collection, items);
  }

  search(
    collection: string,
    params: HybridSearchParams,
  ): Promise<VectorSearchResult[]> {
    const base = parseMemoryFilter(params.filter);
    return this.searchSvc.hybridSearch(
      collection,
      params.denseVector,
      params.sparseIndices,
      params.sparseValues,
      base,
      params.limit,
    );
  }

  async delete(collection: string, spec: VectorDeleteFilter): Promise<number> {
    if (spec.ids !== undefined && spec.ids.length > 0) {
      await this.client.delete(collection, {
        wait: true,
        points: spec.ids,
      });
      return spec.ids.length;
    }

    if (spec.sourceRecordIds !== undefined && spec.sourceRecordIds.length > 0) {
      const filter = {
        should: spec.sourceRecordIds.map((id) => ({
          key: "source_record_id",
          match: { value: id },
        })),
      };

      await this.client.delete(collection, {
        wait: true,
        filter,
      });
      return spec.sourceRecordIds.length;
    }

    if (spec.filter !== undefined) {
      await this.client.delete(collection, {
        wait: true,
        filter: spec.filter,
      } as Parameters<QdrantClient["delete"]>[1]);
      return 0;
    }

    return 0;
  }

  async createSnapshot(collection: string): Promise<string> {
    const snap = await this.snapshotSvc.createSnapshot(collection);
    if (!snap?.name) {
      throw new VectorAdapterError("Snapshot create returned no name");
    }
    return snap.name;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
