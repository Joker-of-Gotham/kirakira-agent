import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  LedgerReader,
  LedgerWriter,
  SegmentManager,
  segmentLedgerFileName,
} from "@kirakira/audit-ledger";
import {
  createTempLedgerDir,
  removeTempDir,
  uniqueEvent,
} from "../../unit/audit-ledger/helpers.js";

describe("tamper detection (audit-ledger)", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await createTempLedgerDir();
  });

  afterEach(async () => {
    await removeTempDir(baseDir);
  });

  it("detects modified event content", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(uniqueEvent({ event_id: "tamper-1" }));
    await w.append(uniqueEvent({ event_id: "tamper-2" }));
    await w.close();

    const seg = (await new SegmentManager(baseDir).listSegments())[0]!;
    const path = join(baseDir, segmentLedgerFileName(seg));
    let text = await readFile(path, "utf8");

    /* Tamper semantic field only; hashes left stale */
    text = text.replace('"tamper-1"', '"tamper-1-FORGED"');
    await writeFile(path, text, "utf8");

    const reader = new LedgerReader(baseDir);
    const res = await reader.verifySegmentChain(seg);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.actual !== e.expected)).toBe(true);
  });

  it("detects deleted event", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(uniqueEvent({ event_id: "del-1" }));
    await w.append(uniqueEvent({ event_id: "del-2" }));
    await w.append(uniqueEvent({ event_id: "del-3" }));
    await w.close();

    const seg = (await new SegmentManager(baseDir).listSegments())[0]!;
    const path = join(baseDir, segmentLedgerFileName(seg));
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    lines.splice(1, 1);
    await writeFile(path, `${lines.join("\n")}\n`, "utf8");

    const reader = new LedgerReader(baseDir);
    const res = await reader.verifySegmentChain(seg);
    expect(res.valid).toBe(false);
  });

  it("detects reordered events", async () => {
    const w = new LedgerWriter({ baseDir });
    await w.append(uniqueEvent({ event_id: "order-1" }));
    await w.append(uniqueEvent({ event_id: "order-2" }));
    await w.append(uniqueEvent({ event_id: "order-3" }));
    await w.close();

    const seg = (await new SegmentManager(baseDir).listSegments())[0]!;
    const path = join(baseDir, segmentLedgerFileName(seg));
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2);
    ;[lines[0], lines[1]] = [lines[1]!, lines[0]!];
    await writeFile(path, `${lines.join("\n")}\n`, "utf8");

    const reader = new LedgerReader(baseDir);
    const res = await reader.verifySegmentChain(seg);
    expect(res.valid).toBe(false);
  });
});
