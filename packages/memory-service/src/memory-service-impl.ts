import type {
  CheckpointRef,
  CheckpointRequest,
  ExplainRetrievalRequest,
  ExportReceipt,
  ExportRequest,
  ForgetReceipt,
  ForgetRequest,
  GraphAdapter,
  MemoryBundle,
  MemoryService,
  RecallRequest,
  ReflectReceipt,
  ReflectRequest,
  RestoredState,
  RetainReceipt,
  RetainRequest,
  RetrievalTrace,
  VectorAdapter,
} from "@kirakira/memory-core";
import { ConfigError, EamError } from "@kirakira/core";
import { createGraphAdapter, type GraphAdapterConfig } from "@kirakira/memory-graph";
import type postgres from "postgres";
import {
  createPgClient,
  createRedisClient,
} from "@kirakira/memory-store";
import { createVectorAdapter } from "@kirakira/memory-vector";

import { HttpEmbeddingClient } from "./adapters/http-embedding-client.js";
import { PostgresStoreAdapter } from "./adapters/postgres-store-adapter.js";
import { RedisCacheAdapter } from "./adapters/redis-cache-adapter.js";
import { RetrievalTraceRepository } from "./adapters/retrieval-trace-repository.js";
import { S3BlobAdapter } from "./adapters/s3-blob-adapter.js";
import type { MemoryServiceConfig } from "./config.js";
import { CheckpointService } from "./checkpoint/checkpoint-service.js";
import { ContextAssembler } from "./context/context-fs.js";
import { ExportService } from "./governance/export-service.js";
import { ForgetService } from "./governance/forget-service.js";
import { RedactionEngine } from "./governance/redaction-engine.js";
import { RecallPipeline } from "./recall/recall-pipeline.js";
import { GraphRecallRoute } from "./recall/routes/graph-route.js";
import { SimilarityRecallRoute } from "./recall/routes/similarity-route.js";
import { StateLookupRecallRoute } from "./recall/routes/state-lookup-route.js";
import { TemporalRecallRoute } from "./recall/routes/temporal-route.js";
import { ReflectPipeline } from "./reflect/reflect-pipeline.js";
import { RetainPipeline } from "./retain/retain-pipeline.js";

import { MEMORY_COLLECTIONS } from "@kirakira/memory-core";
import { EMBEDDING_DIMENSIONS } from "@kirakira/memory-vector";

const ALL_COLLECTIONS = Object.values(MEMORY_COLLECTIONS);

/**
 * Production {@link MemoryService}: retain / recall / reflect / checkpointing / governance, backed by the Kirakira memory stores.
 */
export class MemoryServiceImpl implements MemoryService {
  private readonly pool: postgres.Sql;
  private readonly cache: RedisCacheAdapter;
  private readonly blob: S3BlobAdapter;
  private readonly vector: VectorAdapter;
  private readonly graph: GraphAdapter;
  private readonly embedding: HttpEmbeddingClient;
  private readonly retainPipeline: RetainPipeline;
  private readonly recallPipeline: RecallPipeline;
  private readonly reflectPipeline: ReflectPipeline;
  private readonly checkpointService: CheckpointService;
  private readonly forgetService: ForgetService;
  private readonly exportService: ExportService;
  private readonly traceRepo: RetrievalTraceRepository;
  private readonly redaction: RedactionEngine;
  private readonly embeddingDim: number;
  private primed = false;

  readonly contextAssembler: ContextAssembler;

  constructor(config: MemoryServiceConfig) {
    this.embeddingDim = EMBEDDING_DIMENSIONS[config.embedding.model] ?? 1536;
    this.pool = createPgClient(config.postgres);
    const redis = createRedisClient(config.redis);
    this.cache = new RedisCacheAdapter(redis);
    this.blob = new S3BlobAdapter(config.blob);
    this.vector =
      config.vector.backend === "qdrant"
        ? createVectorAdapter({
            backend: "qdrant",
            host: config.vector.host ?? "127.0.0.1",
            port: config.vector.port ?? 6333,
            apiKey: config.vector.apiKey,
          })
        : createVectorAdapter({ backend: "pgvector", sql: this.pool });
    this.graph = createGraphAdapter(MemoryServiceImpl.graphConfigFrom(config));
    this.embedding = new HttpEmbeddingClient({
      model: config.embedding.model,
      apiKey: config.embedding.apiKey,
      baseUrl: config.embedding.baseUrl,
    });
    const rw = config.recall;
    const storeForRoutes = new PostgresStoreAdapter(this.pool);
    const routes = [
      new SimilarityRecallRoute(rw.similarityWeight ?? 1, this.vector, storeForRoutes),
      new GraphRecallRoute(rw.graphWeight ?? 1, this.graph, storeForRoutes),
      new TemporalRecallRoute(rw.temporalWeight ?? 1, storeForRoutes),
      new StateLookupRecallRoute(rw.stateWeight ?? 1, storeForRoutes),
    ];
    this.retainPipeline = new RetainPipeline({
      blob: this.blob,
      blobConfig: config.blob,
      serviceConfig: config,
    });
    this.recallPipeline = new RecallPipeline({
      routes,
      embedding: this.embedding,
      serviceConfig: config,
    });
    this.reflectPipeline = new ReflectPipeline({
      belief: config.belief,
      contradiction: {},
    });
    this.checkpointService = new CheckpointService(this.blob, config.blob);
    this.forgetService = new ForgetService({
      vector: this.vector,
      graph: this.graph,
      cache: this.cache,
      vectorCollections: ALL_COLLECTIONS,
    });
    this.exportService = new ExportService(this.blob, config.blob.bucket);
    this.traceRepo = new RetrievalTraceRepository(this.pool);
    this.redaction = new RedactionEngine();
    this.contextAssembler = new ContextAssembler();
  }

  private static graphConfigFrom(config: MemoryServiceConfig): GraphAdapterConfig {
    if (config.graph.backend === "neo4j") {
      if (!config.graph.uri || !config.graph.username || !config.graph.password) {
        throw new ConfigError("neo4j backend requires uri, username, and password");
      }
      return {
        backend: "neo4j",
        uri: config.graph.uri,
        username: config.graph.username,
        password: config.graph.password,
        database: config.graph.database,
      };
    }
    return {
      backend: "kuzu",
      dbPath: config.graph.database ?? config.graph.uri ?? "./data/kirakira-memory.kuzu",
    };
  }

  private async primeIndexes(): Promise<void> {
    if (this.primed) return;
    await this.graph.ensureSchema();
    await Promise.all(
      ALL_COLLECTIONS.map((name) => this.vector.ensureCollection(name, this.embeddingDim, name === MEMORY_COLLECTIONS.hybrid)),
    );
    this.primed = true;
  }

  async retain(req: RetainRequest): Promise<RetainReceipt> {
    return await this.pool.begin(async (sql) => {
      const store = new PostgresStoreAdapter(sql);
      return this.retainPipeline.run(req, store);
    });
  }

  async recall(req: RecallRequest): Promise<MemoryBundle> {
    await this.primeIndexes();
    const bundle = await this.recallPipeline.run(req);
    await this.traceRepo.save(bundle.trace);
    if (req.includeRedacted === false) {
      return this.redactBundle(bundle);
    }
    return bundle;
  }

  private redactBundle(bundle: MemoryBundle): MemoryBundle {
    const r = this.redaction;
    const levels = bundle.context.levels;
    const l0 = {
      ...levels.l0,
      abstract: r.redactPlainText(levels.l0.abstract),
    };
    const l1 = levels.l1
      ? {
          ...levels.l1,
          factSummaries: levels.l1.factSummaries.map((x) => r.redactPlainText(x)),
          observationSummaries: levels.l1.observationSummaries.map((x) => r.redactPlainText(x)),
          stateSummary: levels.l1.stateSummary ? r.redactPlainText(levels.l1.stateSummary) : undefined,
        }
      : undefined;
    const l2 = levels.l2
      ? {
          ...levels.l2,
          cards: levels.l2.cards.map((c) => ({
            ...c,
            summary: r.redactPlainText(c.summary),
            provenance: r.redactPlainText(c.provenance),
          })),
        }
      : undefined;
    const l3 = levels.l3
      ? {
          ...levels.l3,
          evidence: levels.l3.evidence.map((e) => ({
            ...e,
            rawSpan: e.rawSpan ? r.redactPlainText(e.rawSpan) : undefined,
          })),
        }
      : undefined;
    return {
      ...bundle,
      context: {
        ...bundle.context,
        levels: { l0, l1, l2, l3 },
      },
    };
  }

  async reflect(req: ReflectRequest): Promise<ReflectReceipt> {
    return await this.pool.begin(async (sql) => {
      const store = new PostgresStoreAdapter(sql);
      return this.reflectPipeline.run(req, store);
    });
  }

  async checkpoint(req: CheckpointRequest): Promise<CheckpointRef> {
    const store = new PostgresStoreAdapter(this.pool);
    return this.checkpointService.save(req, store);
  }

  async restore(ref: CheckpointRef): Promise<RestoredState> {
    const store = new PostgresStoreAdapter(this.pool);
    return this.checkpointService.restore(ref, store);
  }

  async forget(req: ForgetRequest): Promise<ForgetReceipt> {
    const store = new PostgresStoreAdapter(this.pool);
    return this.forgetService.forget(req, store);
  }

  async export(req: ExportRequest): Promise<ExportReceipt> {
    const store = new PostgresStoreAdapter(this.pool);
    return this.exportService.export(req, store);
  }

  async explainRetrieval(req: ExplainRetrievalRequest): Promise<RetrievalTrace> {
    const t = await this.traceRepo.load(req.traceId);
    if (!t) {
      throw new EamError("RETRIEVAL_TRACE_NOT_FOUND", `trace not found: ${req.traceId}`);
    }
    return t;
  }

  async close(): Promise<void> {
    await Promise.all([this.vector.close(), this.graph.close(), this.blob.close(), this.cache.close()]);
    await this.pool.end({ timeout: 5 });
  }
}
