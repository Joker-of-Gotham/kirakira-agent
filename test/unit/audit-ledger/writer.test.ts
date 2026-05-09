import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LedgerWriter,
  SegmentManager,
  segmentLedgerFileName,
  hashChainGenesisHex,
} from "@kirakira/audit-ledger";
import { createTempLedgerDir, removeTempDir, uniqueEvent, deterministicEvent } from "./helpers.js";

describe("LedgerWriter", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await createTempLedgerDir();
  });

  afterEach(async () => {
    await removeTempDir(baseDir);
  });

  it("appends events with correct hash chain", async () => {
    const w = new LedgerWriter({ baseDir });
    const a = await w.append(uniqueEvent({ event_id: "e1" }));
    const b = await w.append(uniqueEvent({ event_id: "e2" }));
    const c = await w.append(uniqueEvent({ event_id: "e3" }));
    expect(b.prev_hash).toBe(a.entry_hash);
    expect(c.prev_hash).toBe(b.entry_hash);
    await w.close();
  });

  it("first event prev_hash is BLAKE3 of empty string", async () => {
    const w = new LedgerWriter({ baseDir });
    const genesis = hashChainGenesisHex();
    const ev = await w.append(uniqueEvent());
    expect(ev.prev_hash).toBe(genesis);
    await w.close();
  });

  it("entry_hash is deterministic", async () => {
    const payload = deterministicEvent();

    const dirA = await createTempLedgerDir();
    const dirB = await createTempLedgerDir();
    try {
      const w1 = new LedgerWriter({ baseDir: dirA });
      const w2 = new LedgerWriter({ baseDir: dirB });
      const e1 = await w1.append(payload);
      const e2 = await w2.append(payload);
      expect(e1.entry_hash).toBe(e2.entry_hash);
      expect(e1.prev_hash).toBe(e2.prev_hash);
      await w1.close();
      await w2.close();
    } finally {
      await removeTempDir(dirA);
      await removeTempDir(dirB);
    }
  });

  it("rotates segment after max entries", async () => {
    const w = new LedgerWriter({
      baseDir,
      maxEntriesPerSegment: 3,
      maxSegmentAgeMs: 86_400_000_000,
    });
    for (let i = 0; i < 5; i++) {
      await w.append(uniqueEvent({ event_id: `rot-${i}` }));
    }
    await w.close();

    const sm = new SegmentManager(baseDir);
    const ids = await sm.listSegments();
    expect(ids).toHaveLength(2);
  });

  it("produces valid JSONL", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(uniqueEvent({ event_id: "json-1" }));
    await w.append(uniqueEvent({ event_id: "json-2" }));
    await w.close();

    const sm = new SegmentManager(baseDir);
    const seg = (await sm.listSegments())[0]!;
    const path = join(baseDir, segmentLedgerFileName(seg));

    const lines: string[] = [];
    const rl = createInterface({
      input: createReadStream(path, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (line.trim()) {
        lines.push(line);
      }
    }

    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const obj = JSON.parse(line) as Record<string, unknown>;
      expect(obj.event_id).toBeDefined();
      expect(obj.entry_hash).toBeDefined();
    }
  });
});
