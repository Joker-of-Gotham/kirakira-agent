import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AuditIndex, LedgerReader, LedgerWriter } from "@kirakira/audit-ledger";
import { createTempLedgerDir, removeTempDir, uniqueEvent } from "./helpers.js";

describe("AuditIndex (SQLite)", () => {
  let baseDir: string;
  let dbPath: string;
  let index: AuditIndex;

  beforeEach(async () => {
    baseDir = await createTempLedgerDir();
    dbPath = join(baseDir, "audit-index.db");
    index = new AuditIndex(dbPath);
  });

  afterEach(async () => {
    index.close();
    await removeTempDir(baseDir);
  });

  it("indexes events and queries by trace_id", async () => {
    const w = new LedgerWriter({ baseDir });
    const tA = "trace-aaa";
    const tB = "trace-bbb";
    await w.append(uniqueEvent({ trace_id: tA, event_id: "a1" }));
    await w.append(uniqueEvent({ trace_id: tB, event_id: "b1" }));
    await w.append(uniqueEvent({ trace_id: tA, event_id: "a2" }));
    await w.close();

    const reader = new LedgerReader(baseDir);
    const segments = await reader.listSegmentIdsSorted();
    for (const seg of segments) {
      for await (const ev of reader.readSegment(seg)) {
        index.indexEvent(ev);
      }
    }

    const rows = index.queryByTraceId(tA);
    expect(rows.map((r) => r.event_id).sort()).toEqual(["a1", "a2"].sort());
  });

  it("queries by time range", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(
      uniqueEvent({ event_id: "s1", ts: "2026-04-01T00:00:00.000Z" }),
    );
    await w.append(
      uniqueEvent({ event_id: "s2", ts: "2026-06-01T00:00:00.000Z" }),
    );
    await w.append(
      uniqueEvent({ event_id: "s3", ts: "2026-08-01T00:00:00.000Z" }),
    );
    await w.close();

    const reader = new LedgerReader(baseDir);
    for (const seg of await reader.listSegmentIdsSorted()) {
      for await (const ev of reader.readSegment(seg)) {
        index.indexEvent(ev);
      }
    }

    const mid = index.queryByTimeRange(
      "2026-05-01T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    );
    expect(mid.map((r) => r.event_id)).toEqual(["s2"]);
  });

  it("queries by kind", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(uniqueEvent({ event_id: "k1", kind: "policy.decision" }));
    await w.append(uniqueEvent({ event_id: "k2", kind: "tool.exec" }));
    await w.append(uniqueEvent({ event_id: "k3", kind: "policy.decision" }));
    await w.close();

    const reader = new LedgerReader(baseDir);
    for (const seg of await reader.listSegmentIdsSorted()) {
      for await (const ev of reader.readSegment(seg)) {
        index.indexEvent(ev);
      }
    }

    const kinds = index.queryByKind("tool.exec");
    expect(kinds).toHaveLength(1);
    expect(kinds[0]!.event_id).toBe("k2");
  });
});
