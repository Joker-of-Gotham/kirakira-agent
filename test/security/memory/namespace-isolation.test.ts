import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MemoryRecord } from "@kirakira/memory-core";

import { InMemoryStoreAdapter } from "../../helpers/memory-test-adapters.js";
import { PostgresStoreAdapter } from "../../../packages/memory-service/src/adapters/postgres-store-adapter.js";
import { setupMemoryPostgresHooks, skipIfNoDocker } from "../../helpers/memory-containers.js";

function record(tenant: string, text: string): MemoryRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: tenant,
    workspaceId: "ws-shared",
    namespace: "project",
    kind: "fact",
    text,
    summaryL0: text.slice(0, 40),
    metadata: {},
    evidenceIds: [],
    entityIds: [],
    txFrom: now,
    retentionClass: "default",
    piiLevel: "none",
    redacted: false,
    createdAt: now,
  };
}

describe("namespace isolation (in-memory)", () => {
  it("scopes queries to tenant id", async () => {
    const store = new InMemoryStoreAdapter();
    await store.insertRecords([
      record("tenant-a", "secret for A"),
      record("tenant-b", "secret for B"),
    ]);

    const aOnly = await store.queryRecords({ tenantId: "tenant-a", limit: 10 });
    expect(aOnly).toHaveLength(1);
    expect(aOnly[0]?.text).toContain("A");
  });
});

describe.skipIf(skipIfNoDocker())("namespace isolation (postgres)", () => {
  const hooks = setupMemoryPostgresHooks();

  it("does not leak rows across tenants", async () => {
    const store = new PostgresStoreAdapter(hooks.sql);
    await store.insertRecords([record("tenant-a", "alpha"), record("tenant-b", "beta")]);

    const aOnly = await store.queryRecords({ tenantId: "tenant-a", limit: 10 });
    expect(aOnly.every((r) => r.tenantId === "tenant-a")).toBe(true);
  });
});
