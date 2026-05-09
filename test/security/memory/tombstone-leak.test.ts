import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "@kirakira/memory-core";

import type { MemoryServiceConfig } from "../../../packages/memory-service/src/config.js";
import { ForgetService } from "../../../packages/memory-service/src/governance/forget-service.js";
import { RecallPipeline } from "../../../packages/memory-service/src/recall/recall-pipeline.js";
import { SimilarityRecallRoute } from "../../../packages/memory-service/src/recall/routes/similarity-route.js";

import {
  HashEmbeddingClient,
  InMemoryStoreAdapter,
  MapCacheStub,
  NoopGraphStub,
  TenantVectorStub,
} from "../../helpers/memory-test-adapters.js";

describe("tombstone leakage", () => {
  it("prevents recalled records after forget removes vector entries", async () => {
    const store = new InMemoryStoreAdapter();
    const vector = new TenantVectorStub();
    const embedding = new HashEmbeddingClient(16);
    const now = new Date().toISOString();
    const id = randomUUID();

    const rec: MemoryRecord = {
      id,
      tenantId: "ts",
      workspaceId: "ws",
      namespace: "user",
      kind: "fact",
      text: "Customer escalation about billing outage 2026-05-01.",
      summaryL0: "billing outage",
      metadata: {},
      evidenceIds: [],
      entityIds: [],
      txFrom: now,
      retentionClass: "default",
      piiLevel: "high",
      redacted: false,
      createdAt: now,
    };

    await store.insertRecord(rec);
    vector.register("ts", id);

    const forget = new ForgetService({
      vector,
      graph: new NoopGraphStub(),
      cache: new MapCacheStub(),
      vectorCollections: ["kirakira_memory"],
    });
    await forget.forget({ tenantId: "ts", workspaceId: "ws", recordIds: [id], reason: "legal_hold_lifted" }, store);

    const pipeline = new RecallPipeline({
      routes: [new SimilarityRecallRoute(1, vector, store)],
      embedding,
      serviceConfig: { recall: { defaultTokenBudget: 2048 } } as MemoryServiceConfig,
    });

    const bundle = await pipeline.run({
      tenantId: "ts",
      workspaceId: "ws",
      query: "billing outage escalation",
      limit: 8,
    });

    expect(bundle.recordIds.includes(id)).toBe(false);
  });
});
