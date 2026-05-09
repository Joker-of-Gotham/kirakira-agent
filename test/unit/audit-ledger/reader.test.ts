import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LedgerReader,
  LedgerWriter,
  SegmentManager,
  segmentLedgerFileName,
} from "@kirakira/audit-ledger";
import { createTempLedgerDir, removeTempDir, uniqueEvent } from "./helpers.js";

describe("LedgerReader", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await createTempLedgerDir();
  });

  afterEach(async () => {
    await removeTempDir(baseDir);
  });

  it("reads all events from a segment", async () => {
    const writer = new LedgerWriter({ baseDir });
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const ev = await writer.append(uniqueEvent({ event_id: `read-${i}` }));
      ids.push(ev.event_id);
    }
    await writer.close();

    const sm = new SegmentManager(baseDir);
    const segmentId = (await sm.listSegments())[0]!;
    const reader = new LedgerReader(baseDir);
    const readBack: string[] = [];
    for await (const ev of reader.readSegment(segmentId)) {
      readBack.push(ev.event_id);
    }
    expect(readBack).toEqual(ids);
  });

  it("verifies a valid segment chain", async () => {
    const writer = new LedgerWriter({ baseDir });
    for (let i = 0; i < 4; i++) {
      await writer.append(uniqueEvent());
    }
    await writer.close();

    const segmentId = (await new SegmentManager(baseDir).listSegments())[0]!;
    const reader = new LedgerReader(baseDir);
    const res = await reader.verifySegmentChain(segmentId);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.entries).toBe(4);
    expect(res.firstHash).not.toBe("");
    expect(res.lastHash).not.toBe("");
  });

  it("detects tampered entry", async () => {
    const writer = new LedgerWriter({ baseDir });
    await writer.append(uniqueEvent({ event_id: "tamper-a" }));
    await writer.append(uniqueEvent({ event_id: "tamper-b" }));
    await writer.close();

    const segmentId = (await new SegmentManager(baseDir).listSegments())[0]!;
    const path = join(baseDir, segmentLedgerFileName(segmentId));
    const raw = await readFile(path, "utf8");
    const line1 = JSON.parse(raw.trim().split("\n")[0]!) as { entry_hash: string };
    const bogus = "a".repeat(64);
    const tampered = raw.replace(line1.entry_hash, bogus);
    await writeFile(path, tampered, "utf8");

    const reader = new LedgerReader(baseDir);
    const res = await reader.verifySegmentChain(segmentId);
    expect(res.valid).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("reads events by time range", async () => {
    const segDay = (await new SegmentManager(baseDir).currentSegmentId()).slice(
      0,
      10,
    );
    const writer = new LedgerWriter({ baseDir });
    await writer.append(
      uniqueEvent({
        event_id: "t-early",
        ts: `${segDay}T08:00:00.000Z`,
      }),
    );
    await writer.append(
      uniqueEvent({
        event_id: "t-mid",
        ts: `${segDay}T14:00:00.000Z`,
      }),
    );
    await writer.append(
      uniqueEvent({
        event_id: "t-late",
        ts: `${segDay}T18:00:00.000Z`,
      }),
    );
    await writer.close();

    const reader = new LedgerReader(baseDir);
    const inRange: string[] = [];
    for await (const ev of reader.readRange({
      since: `${segDay}T12:00:00.000Z`,
      until: `${segDay}T16:00:00.000Z`,
    })) {
      inRange.push(ev.event_id);
    }
    expect(inRange).toEqual(["t-mid"]);
  });
});
