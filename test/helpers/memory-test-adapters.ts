import { randomUUID } from "node:crypto";

import type {
  ArtifactMeta,
  BlobAdapter,
  BlobMetadata,
  BlobObject,
  CacheAdapter,
  DeletionJob,
  Episode,
  GraphAdapter,
  GraphEdgeType,
  GraphNode,
  GraphNodeLabel,
  GraphSearchResult,
  GraphUpsertEdge,
  GraphUpsertNode,
  HybridSearchParams,
  MemoryCheckpoint,
  MemoryRecord,
  OutboxEvent,
  RecordFilter,
  StoreAdapter,
  TraversalParams,
  VectorAdapter,
  VectorDeleteFilter,
  VectorSearchResult,
  VectorUpsertItem,
} from "@kirakira/memory-core";
import type { EmbeddingClient } from "@kirakira/memory-vector";

/** In-memory blob store for integration-style tests without MinIO. */
export class MapBlobAdapter implements BlobAdapter {
  private readonly objects = new Map<string, BlobObject>();

  async put(uri: string, body: Buffer, metadata: BlobMetadata): Promise<void> {
    this.objects.set(uri, { uri, body, metadata });
  }

  async get(uri: string): Promise<BlobObject | null> {
    return this.objects.get(uri) ?? null;
  }

  async head(uri: string): Promise<BlobMetadata | null> {
    const o = this.objects.get(uri);
    return o?.metadata ?? null;
  }

  async delete(uri: string): Promise<void> {
    this.objects.delete(uri);
  }

  async list(prefix: string, _limit = 1000): Promise<string[]> {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }

  async setWormRetention(_uri: string, _retainUntil: string): Promise<void> {}

  async setLegalHold(_uri: string, _hold: boolean): Promise<void> {}

  async close(): Promise<void> {}
}

/** Minimal {@link StoreAdapter} for no-Docker retain/recall contract checks. */
export class InMemoryStoreAdapter implements StoreAdapter {
  private records = new Map<string, MemoryRecord>();
  private episodes = new Map<string, Episode>();
  private checkpoints: MemoryCheckpoint[] = [];
  private artifacts = new Map<string, ArtifactMeta>();
  private outbox: OutboxEvent[] = [];
  private deletionJobs: Map<string, { id: string; tenantId: string; recordIds: string[]; reason: string }> =
    new Map();

  async insertRecord(record: MemoryRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }

  async insertRecords(rows: MemoryRecord[]): Promise<void> {
    await Promise.all(rows.map((r) => this.insertRecord(r)));
  }

  async getRecord(id: string): Promise<MemoryRecord | null> {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }

  async queryRecords(filter: RecordFilter): Promise<MemoryRecord[]> {
    let out = [...this.records.values()].filter((r) => r.tenantId === filter.tenantId);
    if (filter.workspaceId) {
      out = out.filter((r) => r.workspaceId === filter.workspaceId);
    }
    if (filter.namespace) {
      out = out.filter((r) => r.namespace === filter.namespace);
    }
    if (filter.kinds && filter.kinds.length > 0) {
      const set = new Set(filter.kinds);
      out = out.filter((r) => set.has(r.kind));
    }
    if (filter.entityIds && filter.entityIds.length > 0) {
      const es = new Set(filter.entityIds);
      out = out.filter((r) => r.entityIds.some((e) => es.has(e)));
    }
    if (filter.tombstoned !== true) {
      out = out.filter((r) => r.tombstonedAt === undefined);
    }
    if (filter.validAt) {
      const at = Date.parse(filter.validAt);
      out = out.filter((r) => {
        const vf = r.validFrom ? Date.parse(r.validFrom) : -Infinity;
        const vt = r.validTo ? Date.parse(r.validTo) : Infinity;
        return vf <= at && vt > at;
      });
    }
    out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const lim = filter.limit ?? 1000;
    return out.slice(0, lim).map((r) => ({ ...r }));
  }

  async tombstoneRecord(id: string, reason: string): Promise<void> {
    void reason;
    const r = this.records.get(id);
    if (r) {
      this.records.set(id, { ...r, tombstonedAt: new Date().toISOString() });
    }
  }

  async tombstoneRecords(ids: string[], reason: string): Promise<void> {
    await Promise.all(ids.map((id) => this.tombstoneRecord(id, reason)));
  }

  async insertEpisode(episode: Episode): Promise<void> {
    this.episodes.set(episode.id, { ...episode });
  }

  async getEpisode(id: string): Promise<Episode | null> {
    const e = this.episodes.get(id);
    return e ? { ...e } : null;
  }

  async queryEpisodes(tenantId: string, workspaceId: string, limit: number): Promise<Episode[]> {
    return [...this.episodes.values()]
      .filter((e) => e.tenantId === tenantId && e.workspaceId === workspaceId)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async saveCheckpoint(checkpoint: MemoryCheckpoint): Promise<void> {
    this.checkpoints.push({ ...checkpoint });
  }

  async loadCheckpoint(runId: string): Promise<MemoryCheckpoint | null> {
    const rows = this.checkpoints.filter((c) => c.runId === runId);
    if (rows.length === 0) return null;
    return { ...rows.reduce((a, b) => (a.stepNo >= b.stepNo ? a : b)) };
  }

  async loadCheckpointById(id: string): Promise<MemoryCheckpoint | null> {
    const row = this.checkpoints.find((c) => c.id === id);
    return row ? { ...row } : null;
  }

  async listCheckpoints(runId: string): Promise<MemoryCheckpoint[]> {
    return this.checkpoints.filter((c) => c.runId === runId).map((c) => ({ ...c }));
  }

  async insertArtifactMeta(meta: ArtifactMeta): Promise<void> {
    this.artifacts.set(meta.id, { ...meta });
  }

  async getArtifactMeta(id: string): Promise<ArtifactMeta | null> {
    const m = this.artifacts.get(id);
    return m ? { ...m } : null;
  }

  async pushOutboxEvent(
    event: Omit<OutboxEvent, "id" | "status" | "attempts" | "createdAt">,
  ): Promise<string> {
    const id = randomUUID();
    const now = new Date().toISOString();
    this.outbox.push({
      ...event,
      id,
      status: "pending",
      attempts: 0,
      createdAt: now,
    });
    return id;
  }

  peekOutbox(): OutboxEvent[] {
    return this.outbox.map((e) => ({ ...e }));
  }

  async claimOutboxEvents(limit: number): Promise<OutboxEvent[]> {
    return this.outbox.filter((e) => e.status === "pending").slice(0, limit).map((e) => ({ ...e }));
  }

  async completeOutboxEvent(_id: string): Promise<void> {}

  async failOutboxEvent(_id: string, _error: string): Promise<void> {}

  async createDeletionJob(job: {
    tenantId: string;
    recordIds: string[];
    reason: string;
  }): Promise<string> {
    const id = randomUUID();
    this.deletionJobs.set(id, { id, ...job });
    return id;
  }

  async updateDeletionJob(_id: string, _updates: Partial<DeletionJob>): Promise<void> {}

  async runMigrations(): Promise<void> {}

  async close(): Promise<void> {}
}

/** Returns low-dimensional embeddings derived from string hashes (no network). */
export class HashEmbeddingClient implements EmbeddingClient {
  readonly dim: number;

  constructor(dim = 16) {
    this.dim = dim;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.one(t));
  }

  private one(s: string): number[] {
    const out = new Array<number>(this.dim).fill(0);
    for (let i = 0; i < s.length; i++) {
      out[i % this.dim] = (out[i % this.dim]! + s.charCodeAt(i)) / 255;
    }
    const norm = Math.sqrt(out.reduce((a, b) => a + b * b, 0)) || 1;
    return out.map((v) => v / norm);
  }
}

/**
 * Vector index that returns registered record ids per tenant for similarity route tests.
 */
export class TenantVectorStub implements VectorAdapter {
  private readonly byTenant = new Map<string, Set<string>>();

  register(tenantId: string, recordId: string): void {
    const set = this.byTenant.get(tenantId) ?? new Set();
    set.add(recordId);
    this.byTenant.set(tenantId, set);
  }

  async ensureCollection(_name: string, _dimension: number, _hasSparse?: boolean): Promise<void> {}

  async deleteCollection(_name: string): Promise<void> {}

  async listCollections(): Promise<string[]> {
    return [];
  }

  async upsert(_collection: string, items: VectorUpsertItem[]): Promise<void> {
    for (const it of items) {
      const tenant = typeof it.payload["tenant_id"] === "string" ? (it.payload["tenant_id"] as string) : "";
      if (tenant) this.register(tenant, it.sourceRecordId);
    }
  }

  async search(_collection: string, params: HybridSearchParams): Promise<VectorSearchResult[]> {
    const tenant = params.filter?.["tenant_id"] as string | undefined;
    const ids = tenant ? [...(this.byTenant.get(tenant) ?? [])] : [];
    const lim = params.limit ?? 8;
    return ids.slice(0, lim).map((sourceRecordId, i) => ({
      id: sourceRecordId,
      sourceRecordId,
      score: 1 / (i + 1),
      payload: { tenant_id: tenant ?? "" },
    }));
  }

  async delete(_collection: string, filter: VectorDeleteFilter): Promise<number> {
    const ids = filter.sourceRecordIds ?? [];
    let n = 0;
    for (const [, set] of this.byTenant) {
      for (const id of ids) {
        if (set.delete(id)) n++;
      }
    }
    return n;
  }

  async createSnapshot(_collection: string): Promise<string> {
    return "snap";
  }

  async close(): Promise<void> {}
}

export class NoopGraphStub implements GraphAdapter {
  private nodes = new Map<string, GraphUpsertNode>();
  async ensureSchema(): Promise<void> {}
  async upsertNode(node: GraphUpsertNode): Promise<void> {
    this.nodes.set(node.id, node);
  }
  async upsertNodes(nodes: GraphUpsertNode[]): Promise<void> {
    await Promise.all(nodes.map((n) => this.upsertNode(n)));
  }
  async upsertEdge(_edge: GraphUpsertEdge): Promise<void> {}
  async upsertEdges(_edges: GraphUpsertEdge[]): Promise<void> {}
  async getNode(id: string): Promise<GraphNode | null> {
    const n = this.nodes.get(id);
    return n
      ? { id: n.id, label: n.label, props: n.props }
      : null;
  }
  async traverse(params: TraversalParams): Promise<GraphSearchResult> {
    void params;
    return { nodes: [], edges: [] };
  }
  async findNeighbors(_nodeId: string, _edgeTypes?: GraphEdgeType[], _maxDepth?: number): Promise<GraphSearchResult> {
    return { nodes: [], edges: [] };
  }
  async invalidateEdge(_id: string, _expiredAt: string): Promise<void> {}
  invalidateEdgesCalls: Array<{ nodeId: string; edgeTypes: GraphEdgeType[] | undefined; expiredAt?: string }> = [];
  async invalidateEdges(nodeId: string, edgeTypes?: GraphEdgeType[], expiredAt?: string): Promise<void> {
    this.invalidateEdgesCalls.push({ nodeId, edgeTypes, expiredAt });
  }
  async deleteNode(_id: string): Promise<void> {}
  async deleteNodes(_ids: string[]): Promise<void> {}
  async close(): Promise<void> {}
}

/** Graph stub that returns synthetic nodes pointing at the given record ids. */
export class GraphFixtureStub implements GraphAdapter {
  constructor(private readonly recordIds: string[]) {}
  async ensureSchema(): Promise<void> {}
  async upsertNode(_node: GraphUpsertNode): Promise<void> {}
  async upsertNodes(_nodes: GraphUpsertNode[]): Promise<void> {}
  async upsertEdge(_edge: GraphUpsertEdge): Promise<void> {}
  async upsertEdges(_edges: GraphUpsertEdge[]): Promise<void> {}
  async getNode(_id: string): Promise<GraphNode | null> {
    return null;
  }
  async traverse(_params: TraversalParams): Promise<GraphSearchResult> {
    const nodes: GraphNode[] = this.recordIds.map((id) => ({
      id: `n-${id}`,
      label: "Fact" as GraphNodeLabel,
      props: { sourceRecordId: id },
    }));
    return { nodes, edges: [] };
  }
  async findNeighbors(_nodeId: string, _edgeTypes?: GraphEdgeType[], _maxDepth?: number): Promise<GraphSearchResult> {
    return { nodes: [], edges: [] };
  }
  async invalidateEdge(_id: string, _expiredAt: string): Promise<void> {}
  async invalidateEdges(_nodeId: string, _edgeTypes?: GraphEdgeType[], _expiredAt?: string): Promise<void> {}
  async deleteNode(_id: string): Promise<void> {}
  async deleteNodes(_ids: string[]): Promise<void> {}
  async close(): Promise<void> {}
}

export class MapCacheStub implements CacheAdapter {
  private readonly m = new Map<string, unknown>();
  deletePatternCalls: string[] = [];

  async get<T>(key: string): Promise<T | null> {
    return (this.m.get(key) as T) ?? null;
  }
  async set<T>(key: string, value: T, _ttlMs?: number): Promise<void> {
    this.m.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.m.delete(key);
  }
  async deletePattern(pattern: string): Promise<number> {
    this.deletePatternCalls.push(pattern);
    return 0;
  }
  async acquireLock(_key: string, _ttlMs: number): Promise<string | null> {
    return null;
  }
  async releaseLock(_key: string, _token: string): Promise<boolean> {
    return true;
  }
  async extendLock(_key: string, _token: string, _ttlMs: number): Promise<boolean> {
    return true;
  }
  async publishToStream(_stream: string, _data: Record<string, string>): Promise<string> {
    return "";
  }
  async consumeStream(
    _stream: string,
    _group: string,
    _consumer: string,
    _count: number,
  ): Promise<Array<{ id: string; data: Record<string, string> }>> {
    return [];
  }
  async ackStream(_stream: string, _group: string, _ids: string[]): Promise<void> {}
  async createConsumerGroup(_stream: string, _group: string): Promise<void> {}
  async close(): Promise<void> {}
}
