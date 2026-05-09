import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { LedgerReader, LedgerWriter } from "@kirakira/audit-ledger";
import { createTempLedgerDir, removeTempDir, uniqueEvent } from "../../unit/audit-ledger/helpers.js";

describe("hash chain integrity (contract)", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await createTempLedgerDir();
  });

  afterEach(async () => {
    await removeTempDir(baseDir);
  });

  it("full chain integrity across 100 events", async () => {
    const w = new LedgerWriter({
      baseDir,
      maxSegmentAgeMs: 86_400_000_000,
    });
    for (let i = 0; i < 100; i++) {
      await w.append(uniqueEvent({ event_id: `h-${i}` }));
    }
    await w.close();

    const reader = new LedgerReader(baseDir);
    const seg = (await reader.listSegmentIdsSorted())[0]!;
    const res = await reader.verifySegmentChain(seg);
    expect(res.valid).toBe(true);
    expect(res.entries).toBe(100);
  });

  it("chain integrity survives segment rotation", async () => {
    const w = new LedgerWriter({
      baseDir,
      maxEntriesPerSegment: 20,
      maxSegmentAgeMs: 86_400_000_000,
    });
    for (let i = 0; i < 45; i++) {
      await w.append(uniqueEvent({ event_id: `rot-${i}` }));
    }
    await w.close();

    const reader = new LedgerReader(baseDir);
    const segments = await reader.listSegmentIdsSorted();
    expect(segments.length).toBeGreaterThan(1);

    for (const seg of segments) {
      const res = await reader.verifySegmentChain(seg);
      expect(res.valid).toBe(true);
      expect(res.entries).toBeGreaterThan(0);
    }
  });
});
