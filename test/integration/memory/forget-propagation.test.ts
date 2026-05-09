import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "@kirakira/memory-core";

import { ForgetService } from "../../../packages/memory-service/src/governance/forget-service.js";

import {
  InMemoryStoreAdapter,
  MapCacheStub,
  NoopGraphStub,
  TenantVectorStub,
} from "../../helpers/memory-test-adapters.js";

describe("forget propagation (stubbed indexes)", () => {
  it("tombstones rows and propagates deletes to vector, graph, and cache layers", async () => {
    const store = new InMemoryStoreAdapter();
    const vector = new TenantVectorStub();
    const graph = new NoopGraphStub();
    const cache = new MapCacheStub();

    const forget = new ForgetService({
      vector,
      graph,
      cache,
      vectorCollections: ["kirakira_memory"],
    });

    const id1 = randomUUID();
    const id2 = randomUUID();
    const now = new Date().toISOString();
    const base = (id: string): MemoryRecord => ({
      id,
      tenantId: "t-forget",
      workspaceId: "w1",
      namespace: "project",
      kind: "fact",
      text: "sensitive line",
      summaryL0: "s",
      metadata: {},
      evidenceIds: [],
      entityIds: [],
      txFrom: now,
      retentionClass: "default",
      piiLevel: "none",
      redacted: false,
      createdAt: now,
    });

    await store.insertRecords([base(id1), base(id2)]);
    vector.register("t-forget", id1);
    vector.register("t-forget", id2);

    const receipt = await forget.forget(
      {
        tenantId: "t-forget",
        workspaceId: "w1",
        recordIds: [id1],
        reason: "user_request",
      },
      store,
    );

    expect(receipt.tombstonedIds).toEqual([id1]);
    expect(receipt.indexesDeleted).toBeGreaterThan(0);
    expect(graph.invalidateEdgesCalls.length).toBeGreaterThan(0);
    expect(cache.deletePatternCalls.some((p) => p.includes("t-forget"))).toBe(true);

    const rows = await store.queryRecords({ tenantId: "t-forget", workspaceId: "w1", limit: 10 });
    expect(rows.find((r) => r.id === id1)).toBeUndefined();
    expect(rows.find((r) => r.id === id2)).toBeDefined();
  });
});
