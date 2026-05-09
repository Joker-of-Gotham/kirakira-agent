import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import type { AuditEvent } from "@kirakira/core";
import {
  computeEntryHash,
  persistedAuditEventHashPayload,
  type LedgerEventPayload,
} from "./hash-chain.js";
import { SegmentManager } from "./segment.js";

export interface ChainError {
  index: number;
  eventId: string;
  expected: string;
  actual: string;
}

export interface ChainVerifyResult {
  valid: boolean;
  entries: number;
  firstHash: string;
  lastHash: string;
  errors: ChainError[];
}

export interface ReadRangeOpts {
  since?: string;
  until?: string;
  kind?: string;
  limit?: number;
}

function cmpIso(a: string, b: string): number {
  if (a > b) {
    return 1;
  }
  return a < b ? -1 : 0;
}

export class LedgerReader {
  private readonly segments: SegmentManager;

  constructor(baseDir: string) {
    this.segments = new SegmentManager(baseDir);
  }

  segmentPath(segmentId: string): string {
    return this.segments.getSegmentPath(segmentId);
  }

  async listSegmentIdsSorted(): Promise<string[]> {
    return this.segments.listSegments();
  }

  async *readSegment(segmentId: string): AsyncGenerator<AuditEvent> {
    yield* iterSegmentJsonLines(this.segmentPath(segmentId));
  }

  /** Stable alias reused by tooling that highlights non-writer iterators. */
  readSegmentUnlocked(segmentId: string): AsyncGenerator<AuditEvent> {
    return this.readSegment(segmentId);
  }

  async *readRange(opts: ReadRangeOpts): AsyncGenerator<AuditEvent> {
    let yielded = 0;
    const limit = opts.limit ?? Number.MAX_SAFE_INTEGER;
    const ids = await this.listSegmentIdsSorted();

    outer: for (const segId of ids) {
      const segDate = segId.slice(0, 10);
      if (
        opts.since &&
        segDate.localeCompare(opts.since.slice(0, 10), "en") < 0
      ) {
        continue;
      }

      for await (const ev of this.readSegment(segId)) {
        if (opts.since && cmpIso(ev.ts, opts.since) < 0) {
          continue;
        }
        if (opts.until && cmpIso(ev.ts, opts.until) > 0) {
          break outer;
        }
        if (opts.kind && ev.kind !== opts.kind) {
          continue;
        }
        yield ev;
        yielded += 1;
        if (yielded >= limit) {
          break outer;
        }
      }
    }
  }

  async verifySegmentChain(segmentId: string): Promise<ChainVerifyResult> {
    const errors: ChainError[] = [];
    let index = -1;
    let firstHash = "";
    let lastHash = "";
    let prevEntryHash = "";

    for await (const ev of this.readSegment(segmentId)) {
      index += 1;
      if (index === 0) {
        firstHash = ev.entry_hash;
      }
      lastHash = ev.entry_hash;

      if (index > 0) {
        const expectedPrev = prevEntryHash;
        if (ev.prev_hash !== expectedPrev) {
          errors.push({
            index,
            eventId: ev.event_id,
            expected: expectedPrev,
            actual: ev.prev_hash,
          });
        }
      }

      const canon: LedgerEventPayload = persistedAuditEventHashPayload(ev);
      const recomputed = computeEntryHash(segmentId, ev.prev_hash, canon);
      if (recomputed !== ev.entry_hash) {
        errors.push({
          index,
          eventId: ev.event_id,
          expected: recomputed,
          actual: ev.entry_hash,
        });
      }

      prevEntryHash = ev.entry_hash;
    }

    const entries = index + 1;
    if (entries === 0) {
      return {
        valid: false,
        entries: 0,
        firstHash: "",
        lastHash: "",
        errors: [],
      };
    }

    const valid = errors.length === 0;
    return { valid, entries, firstHash, lastHash, errors };
  }
}

async function* iterSegmentJsonLines(
  absolutePath: string,
): AsyncGenerator<AuditEvent> {
  await import("node:fs/promises").then((fs) => fs.stat(absolutePath)); /* ENOENT */

  const rl = createInterface({
    input: createReadStream(absolutePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }
      yield JSON.parse(line) as AuditEvent;
    }
  } finally {
    rl.close();
  }
}
