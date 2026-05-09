import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "@kirakira/memory-core";

import { PostgresStoreAdapter } from "../../../packages/memory-service/src/adapters/postgres-store-adapter.js";
import { TemporalRecallRoute } from "../../../packages/memory-service/src/recall/routes/temporal-route.js";

import { InMemoryStoreAdapter } from "../../helpers/memory-test-adapters.js";
import { setupMemoryPostgresHooks, skipIfNoDocker } from "../../helpers/memory-containers.js";

function sampleRecord(partial: Partial<MemoryRecord> & Pick<MemoryRecord, "id" | "tenantId" | "workspaceId">): MemoryRecord {
  const now = new Date().toISOString();
  return {
    namespace: "project",
    kind: "fact",
    text: "temporal slice",
    summaryL0: "slice",
    metadata: {},
    evidenceIds: [],
    entityIds: [],
    txFrom: now,
    retentionClass: "default",
    piiLevel: "none",
    redacted: false,
    createdAt: now,
    ...partial,
  };
}

describe("temporal query (in-memory)", () => {
  it("filters by validFrom/validTo against query windows", async () => {
    const store = new InMemoryStoreAdapter();
    const route = new TemporalRecallRoute(1, store);

    const t0 = "2026-01-01T00:00:00.000Z";
    const t1 = "2026-06-01T00:00:00.000Z";
    const t2 = "2026-12-31T00:00:00.000Z";

    await store.insertRecords([
      sampleRecord({
        id: randomUUID(),
        tenantId: "tt",
        workspaceId: "ww",
        validFrom: t0,
        validTo: t1,
        text: "early window",
      }),
      sampleRecord({
        id: randomUUID(),
        tenantId: "tt",
        workspaceId: "ww",
        validFrom: t1,
        validTo: undefined,
        text: "open ended",
      }),
    ]);

    const mid = "2026-03-01T00:00:00.000Z";
    const res = await route.execute({
      tenantId: "tt",
      workspaceId: "ww",
      query: "ignored",
      normalizedQuery: "ignored",
      entityIds: [],
      timeWindow: { from: t0, to: mid },
      runId: undefined,
      sessionId: undefined,
      embedding: [],
      limit: 8,
    });

    expect(res.records.every((r) => r.record.text === "early window")).toBe(true);
  });
});

describe.skipIf(skipIfNoDocker())("temporal query (postgres)", () => {
  const hooks = setupMemoryPostgresHooks();

  it("honors validity interval semantics from persisted rows", async () => {
    const store = new PostgresStoreAdapter(hooks.sql);
    const route = new TemporalRecallRoute(1, store);

    const tStart = "2026-04-01T00:00:00.000Z";
    const tMid = "2026-04-15T00:00:00.000Z";
    const tEnd = "2026-04-30T00:00:00.000Z";

    await store.insertRecord(
      sampleRecord({
        id: randomUUID(),
        tenantId: "tt-pg",
        workspaceId: "ww-pg",
        validFrom: tStart,
        validTo: tEnd,
      }),
    );

    const inside = await route.execute({
      tenantId: "tt-pg",
      workspaceId: "ww-pg",
      query: "q",
      normalizedQuery: "q",
      entityIds: [],
      timeWindow: { from: tStart, to: tMid },
      embedding: [],
      limit: 8,
    });
    expect(inside.records.length).toBeGreaterThan(0);

    const outside = await route.execute({
      tenantId: "tt-pg",
      workspaceId: "ww-pg",
      query: "q",
      normalizedQuery: "q",
      entityIds: [],
      timeWindow: { from: "2026-05-01T00:00:00.000Z", to: "2026-05-02T00:00:00.000Z" },
      embedding: [],
      limit: 8,
    });
    expect(outside.records.length).toBe(0);
  });
});
