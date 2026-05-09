import { createHash, randomUUID } from "node:crypto";

import type {
  BlobAdapter,
  Episode,
  EpisodeSegment,
  MemoryRecord,
  RetainRequest,
  RetainReceipt,
  StoreAdapter,
} from "@kirakira/memory-core";

import { resolveEpisodeBodyUri, type BlobConfig } from "../adapters/s3-blob-adapter.js";
import { PostgresStoreAdapter } from "../adapters/postgres-store-adapter.js";
import type { MemoryServiceConfig } from "../config.js";
import { EvidenceBinder } from "./evidence-binder.js";
import { MemoryEventClassifier } from "./event-classifier.js";
import { RetentionScorer } from "./retention-scorer.js";

function extractCandidateFacts(
  content: string,
  opts: { baseConfidence: number; confidenceStep: number },
): Array<{ text: string; confidence: number }> {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const facts = sentences.filter((s) =>
    /\b(is|are|was|were|means|defines|requires|always|never|must|should)\b/i.test(s),
  );
  const pick = facts.length > 0 ? facts.slice(0, 8) : sentences.slice(0, 3);
  return pick.map((text, i) => ({
    text,
    confidence: opts.baseConfidence + opts.confidenceStep * Math.min(i, 3),
  }));
}

export class RetainPipeline {
  private readonly classifier = new MemoryEventClassifier();
  private readonly scorer = new RetentionScorer();
  private readonly binder = new EvidenceBinder();

  constructor(
    private readonly deps: {
      blob: BlobAdapter;
      blobConfig: BlobConfig;
      serviceConfig: MemoryServiceConfig;
    },
  ) {}

  /**
   * Six-stage retain pipeline. Caller must supply a {@link StoreAdapter} scoped to an open transaction when ACID is required.
   */
  async run(req: RetainRequest, store: StoreAdapter): Promise<RetainReceipt> {
    const classified = this.classifier.classify(req.content, req.metadata);
    const sourceType = classified.sourceType;
    const now = new Date();
    const nowIso = now.toISOString();
    const episodeId = randomUUID();
    const segmentId = randomUUID();
    const bodyUri = resolveEpisodeBodyUri(this.deps.blobConfig, req.tenantId, episodeId);

    const bodyBuf = Buffer.from(req.content, "utf8");
    const bodySha256 = createHash("sha256").update(bodyBuf).digest("hex");
    await this.deps.blob.put(bodyUri, bodyBuf, {
      contentType: "text/markdown; charset=utf-8",
      sha256: bodySha256,
      size: bodyBuf.byteLength,
    });

    const episode: Episode = {
      id: episodeId,
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      sessionId: req.sessionId,
      sourceType,
      startAt: nowIso,
      endAt: nowIso,
      bodyBlobUri: bodyUri,
      segmentationScore: classified.estimatedImportance,
      metadata: {
        ...req.metadata,
        classification: classified,
      },
      createdAt: nowIso,
    };

    await store.insertEpisode(episode);

    const segment: EpisodeSegment = {
      id: segmentId,
      episodeId,
      offsetStart: 0,
      offsetEnd: req.content.length,
      text: req.content.slice(0, 16_384),
      entityRefs: [],
      createdAt: nowIso,
    };

    if (store instanceof PostgresStoreAdapter) {
      await store.insertEpisodeSegment(segment);
    }

    const recent = await store.queryRecords({
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      namespace: req.namespace,
      limit: 40,
    });
    const importance = this.scorer.predictRetainScore(recent, req.content, classified.estimatedImportance);

    const episodeRecord: MemoryRecord = {
      id: randomUUID(),
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      actorId: req.actorId,
      namespace: req.namespace,
      kind: "episode",
      text: req.content.slice(0, 4096),
      summaryL0: `Episode ${episodeId.slice(0, 8)} · ${sourceType}`,
      metadata: { episodeId, segmentId },
      evidenceIds: [segmentId],
      entityIds: [],
      txFrom: nowIso,
      retentionClass: req.retentionClass ?? "default",
      piiLevel: req.piiLevel ?? "none",
      redacted: false,
      createdAt: nowIso,
    };

    await store.insertRecord(episodeRecord);

    const extractPayload = {
      episodeId,
      segmentId,
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
      namespace: req.namespace,
    };
    const extractEventId = await store.pushOutboxEvent({
      tenantId: req.tenantId,
      aggregateType: "memory_episode",
      aggregateId: episodeId,
      eventType: "memory.fact.extract",
      payload: extractPayload,
      availableAt: nowIso,
    });

    const retainCfg = this.deps.serviceConfig.retain ?? {};
    const facts = extractCandidateFacts(req.content, {
      baseConfidence: retainCfg.factBaseConfidence ?? 0.65,
      confidenceStep: retainCfg.factConfidenceStep ?? 0.05,
    });
    const factRecords = this.binder.bindFacts(
      {
        tenantId: req.tenantId,
        workspaceId: req.workspaceId,
        namespace: req.namespace,
        episodeId,
        segment,
        extractedFacts: facts,
        retentionClass: req.retentionClass ?? "default",
        piiLevel: req.piiLevel ?? "none",
        actorId: req.actorId,
      },
      nowIso,
    );

    if (factRecords.length > 0) {
      await store.insertRecords(factRecords);
    }

    const indexEventId = await store.pushOutboxEvent({
      tenantId: req.tenantId,
      aggregateType: "memory_episode",
      aggregateId: episodeId,
      eventType: "memory.index.materialize",
      payload: {
        episodeId,
        recordIds: [episodeRecord.id, ...factRecords.map((f) => f.id)],
      },
      availableAt: nowIso,
    });

    const reflectThreshold = retainCfg.reflectThreshold ?? 0.72;
    if (importance >= reflectThreshold) {
      await store.pushOutboxEvent({
        tenantId: req.tenantId,
        aggregateType: "memory_episode",
        aggregateId: episodeId,
        eventType: "memory.reflect.request",
        payload: { episodeId, importance },
        availableAt: nowIso,
      });
    }

    void extractEventId;

    return {
      episodeId,
      memoryRecordIds: [episodeRecord.id, ...factRecords.map((f) => f.id)],
      factIds: factRecords.map((f) => f.id),
      outboxEventId: indexEventId,
      retainedAt: nowIso,
    };
  }
}
