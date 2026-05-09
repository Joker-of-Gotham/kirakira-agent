import { mkdir, appendFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { AuditEvent } from "@kirakira/core";
import { AsyncMutex } from "./async-mutex.js";
import type { LedgerEventPayload } from "./hash-chain.js";
import {
  computeEntryHash,
  persistedAuditEventHashPayload,
} from "./hash-chain.js";
import {
  SegmentManager,
  hashChainGenesisHex,
  segmentLedgerFileName,
} from "./segment.js";
import { compressSegment } from "./segment-compress.js";

const DEFAULT_MAX_ENTRIES = 5000;
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

export interface LedgerWriterOptions {
  baseDir: string;
  maxEntriesPerSegment?: number;
  maxSegmentAgeMs?: number;
  /** When true, compress the rotated-out segment file via zstd (fallback: gzip). */
  compressSegmentsOnRotate?: boolean;
}

/** Parse last non-empty JSON line cheaply via tail read (~64 KiB chunks). */
async function readLastJsonLineTail(filePath: string): Promise<string | null> {
  const fs = await import("node:fs/promises");
  const fh = await fs.open(filePath, "r");
  try {
    const st = await fh.stat();
    const size = st.size;
    if (size === 0) {
      return null;
    }
    let pos = size;
    const bufCap = Math.min(size, 64 * 1024);
    while (pos > 0) {
      const chunkLen = Math.min(bufCap, pos);
      pos -= chunkLen;
      const buf = Buffer.alloc(chunkLen);
      await fh.read(buf, 0, chunkLen, pos);
      const text = buf.toString("utf8");
      let end = chunkLen - 1;
      while (end >= 0 && (text[end] === "\n" || text[end] === "\r")) {
        end -= 1;
      }
      if (end < 0) {
        continue;
      }
      const trimmed = text.slice(0, end + 1);
      const nl = trimmed.lastIndexOf("\n");
      const candidate =
        nl === -1 ? trimmed : trimmed.slice(nl + 1).trimStart();
      if (candidate.trim().length > 0) {
        return candidate.trimEnd();
      }
    }
    return null;
  } finally {
    await fh.close();
  }
}

async function countTerminalNewlines(path: string): Promise<number> {
  const fh = await import("node:fs/promises");
  const fd = await fh.open(path, "r");
  try {
    const buf = Buffer.alloc(65536);
    let readPos = 0;
    let count = 0;
    while (true) {
      const { bytesRead } = await fd.read(buf, 0, buf.length, readPos);
      if (bytesRead === 0) {
        break;
      }
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] === 0x0a) {
          count += 1;
        }
      }
      readPos += bytesRead;
    }
    return count;
  } finally {
    await fd.close();
  }
}

export type LedgerAppendInput = Omit<
  AuditEvent,
  "segment" | "prev_hash" | "entry_hash"
>;

function appendInputToHashPayload(inp: LedgerAppendInput): LedgerEventPayload {
  return {
    version: inp.version ?? "kirakira.audit.v1",
    event_id: inp.event_id,
    ts: inp.ts,
    trace_id: inp.trace_id,
    decision_id: inp.decision_id,
    kind: inp.kind,
    actor: inp.actor,
    subject: inp.subject,
    result: inp.result,
    metrics: inp.metrics,
    integrity: inp.integrity,
  };
}

export class LedgerWriter {
  private readonly segmentManager: SegmentManager;
  private readonly maxEntriesPerSegment: number;
  private readonly maxSegmentAgeMs: number;
  private readonly compressSegmentsOnRotate: boolean;

  private activeSegmentId!: string;
  private prevHashHex!: string;
  private entryCountInSegment = 0;
  private segmentStartTimeMs = 0;

  private closed = false;
  private readonly mutex = new AsyncMutex();
  private bootstrapped?: Promise<void>;

  constructor(private readonly options: LedgerWriterOptions) {
    this.segmentManager = new SegmentManager(options.baseDir);
    this.maxEntriesPerSegment =
      options.maxEntriesPerSegment ?? DEFAULT_MAX_ENTRIES;
    this.maxSegmentAgeMs = options.maxSegmentAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.compressSegmentsOnRotate = options.compressSegmentsOnRotate ?? false;
  }

  private async bootstrapCurrentSegment(ids: string[]): Promise<void> {
    const lastSegment = ids[ids.length - 1]!;
    this.activeSegmentId = lastSegment;
    const lastPath = this.segmentManager.getSegmentPath(lastSegment);
    let lastLine = await readLastJsonLineTail(lastPath);
    /* Rare parse edge case: malformed tail window — resilient via readline */
    if (
      lastLine &&
      !((): boolean => {
        try {
          JSON.parse(lastLine);
          return true;
        } catch {
          return false;
        }
      })()
    ) {
      lastLine = await readLastLineViaReadlineFallback(lastPath);
    }

    let stWrap: null | import("node:fs").Stats = null;
    try {
      stWrap = await stat(lastPath);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") {
        throw e;
      }
    }

    const lastEmpty = lastLine === null || lastLine.trim().length === 0;

    if (!lastEmpty) {
      const ev = JSON.parse(lastLine!) as AuditEvent;
      if (typeof ev.entry_hash !== "string") {
        throw new Error(`Invalid tail audit entry in segment ${lastSegment}`);
      }
      this.prevHashHex = ev.entry_hash;
      this.entryCountInSegment = await countTerminalNewlines(lastPath);
      this.segmentStartTimeMs =
        stWrap?.birthtimeMs ?? stWrap?.mtimeMs ?? Date.now();
      return;
    }

    /* Tail segment empty → chain tip sits on previous ledger file(s). */
    if (ids.length >= 2) {
      await this.bootstrapPrevSegmentTail(ids.slice(0, -1));
      /* Segment age anchor rebinds toward predecessor lineage start */
      return;
    }

    /* Single segment only */
    if (!stWrap) {
      throw new Error(
        `Ledger segment referenced but missing file: ${lastSegment}`,
      );
    }
    if (stWrap.size === 0) {
      /* Virgin first segment awaiting first append */
      this.prevHashHex = hashChainGenesisHex();
      this.entryCountInSegment = 0;
      this.segmentStartTimeMs =
        stWrap.birthtimeMs ?? stWrap.mtimeMs ?? Date.now();
      return;
    }

    /*
     * File has bytes yet no JSON line surfaced — unreadable ledger tail (partial write /
     * corruption). Refuse ambiguous bootstrap.
     */
    throw new Error(
      `Corrupted or unreadable audit ledger tail in segment ${lastSegment}`,
    );
  }

  private async bootstrapPrevSegmentTail(parentIds: string[]): Promise<void> {
    let prevHex = hashChainGenesisHex();
    let startMs = Date.now();
    outer: for (let idx = parentIds.length - 1; idx >= 0; idx -= 1) {
      const seg = parentIds[idx]!;
      const p = this.segmentManager.getSegmentPath(seg);
      const line =
        (await readLastJsonLineTail(p)) ??
        (await readLastLineViaReadlineFallback(p));
      if (line?.trim()) {
        const ev = JSON.parse(line) as AuditEvent;
        if (typeof ev.entry_hash !== "string") {
          throw new Error(`Invalid tail audit entry in segment ${seg}`);
        }
        prevHex = ev.entry_hash;
        try {
          const st = await stat(p);
          startMs = st.birthtimeMs ?? st.mtimeMs;
        } catch {
          startMs = Date.now();
        }
        break outer;
      }
    }
    this.prevHashHex = prevHex;
    /* Current active empty tail segment inherits zero appended lines locally */
    this.entryCountInSegment = 0;
    this.segmentStartTimeMs = startMs;
  }

  private async ensureBootstrap(): Promise<void> {
    if (!this.bootstrapped) {
      this.bootstrapped = (async (): Promise<void> => {
        await mkdir(this.options.baseDir, { recursive: true });
        const ids = await this.segmentManager.listSegments();

        if (ids.length === 0) {
          const fresh = await this.segmentManager.currentSegmentId();
          this.activeSegmentId = fresh;
          this.prevHashHex = hashChainGenesisHex();
          this.entryCountInSegment = 0;
          this.segmentStartTimeMs = Date.now();
          return;
        }

        await this.bootstrapCurrentSegment(ids);
      })().catch((e): undefined => {
        this.bootstrapped = undefined;
        throw e;
      });
    }
    await this.bootstrapped;
  }

  private async rotateIfNeeded(): Promise<void> {
    if (
      !this.segmentManager.shouldRotate(
        this.entryCountInSegment,
        this.segmentStartTimeMs,
        this.maxEntriesPerSegment,
        this.maxSegmentAgeMs,
      )
    ) {
      return;
    }
    const completedLedgerPath = this.ledgerPath(this.activeSegmentId);
    /* Keep global hash linkage — only segment file / counters reset */
    const nextSeg = await this.segmentManager.createNewSegment();
    this.activeSegmentId = nextSeg;
    this.entryCountInSegment = 0;
    this.segmentStartTimeMs = Date.now();

    if (this.compressSegmentsOnRotate) {
      await compressSegment(completedLedgerPath);
    }
  }

  private ledgerPath(seg: string): string {
    return join(this.options.baseDir, segmentLedgerFileName(seg));
  }

  async append(eventIn: LedgerAppendInput): Promise<AuditEvent> {
    const unlock = await this.mutex.acquire();
    try {
      if (this.closed) {
        throw new Error("LedgerWriter is closed");
      }
      await this.ensureBootstrap();
      await this.rotateIfNeeded();

      const segmentId = this.activeSegmentId;
      const payloadForHash = appendInputToHashPayload(eventIn);
      const entryHashHex = computeEntryHash(
        segmentId,
        this.prevHashHex,
        payloadForHash,
      );

      const fullEvent: AuditEvent = {
        ...eventIn,
        version: eventIn.version ?? "kirakira.audit.v1",
        segment: segmentId,
        prev_hash: this.prevHashHex,
        entry_hash: entryHashHex,
      };

      sanityRecomputeHashes(fullEvent, segmentId);

      const line = `${JSON.stringify(fullEvent)}\n`;
      await appendFile(this.ledgerPath(segmentId), line, {
        encoding: "utf8",
        flag: "a",
      });

      if (this.entryCountInSegment === 0) {
        this.segmentStartTimeMs = Date.now();
      }
      this.entryCountInSegment += 1;
      this.prevHashHex = entryHashHex;
      return fullEvent;
    } finally {
      unlock();
    }
  }

  async close(): Promise<void> {
    const unlock = await this.mutex.acquire();
    try {
      this.closed = true;
    } finally {
      unlock();
    }
  }
}

function sanityRecomputeHashes(ev: AuditEvent, segmentId: string): void {
  const canon = persistedAuditEventHashPayload(ev);
  const expected = computeEntryHash(segmentId, ev.prev_hash, canon);
  if (expected !== ev.entry_hash) {
    throw new Error("Internal ledger hash recomputation mismatch before append");
  }
}

/** Slow-path exact last JSON line replay (helps under rare partial-write tails). */
export async function readLastLineViaReadlineFallback(
  filePath: string,
): Promise<string | null> {
  const fsMod = await import("node:fs");
  let lastNonEmpty: string | null = null;
  await new Promise<void>((resolve, reject) => {
    const rl = createInterface({
      input: fsMod.createReadStream(filePath, { encoding: "utf8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (ln) => {
      if (ln.trim().length > 0) {
        lastNonEmpty = ln.trimEnd();
      }
    });
    rl.on("close", () => resolve());
    rl.on("error", reject);
  });
  return lastNonEmpty;
}