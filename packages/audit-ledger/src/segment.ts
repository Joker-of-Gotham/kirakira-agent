import { join } from "node:path";
import { createHash } from "blake3";

const SEGMENT_FILE_REGEX = /^ledger-(\d{4}-\d{2}-\d{2}-\d+)\.jsonl$/;

/** Compare two `YYYY-MM-DD-NNNN` segment ids chronologically / lexically. */
function compareSegmentId(a: string, b: string): number {
  if (a > b) {
    return 1;
  }
  return a < b ? -1 : 0;
}

export function parseSegmentId(segmentId: string): {
  date: string;
  seq: number;
} | null {
  const m = /^(\d{4}-\d{2}-\d{2})-(\d{4})$/.exec(segmentId);
  if (!m) {
    return null;
  }
  const date = m[1];
  const seqStr = m[2];
  if (typeof date !== "string" || typeof seqStr !== "string") {
    return null;
  }
  return { date, seq: Number.parseInt(seqStr, 10) };
}

function todayUtcDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Stable genesis `prev_hash` for the absolute first ledger entry only. */
export function hashChainGenesisHex(): string {
  return createHash().update(Buffer.alloc(0)).digest("hex");
}

export function segmentLedgerFileName(segmentId: string): string {
  return `ledger-${segmentId}.jsonl`;
}

export class SegmentManager {
  constructor(private readonly baseDir: string) {}

  getSegmentPath(segmentId: string): string {
    return join(this.baseDir, segmentLedgerFileName(segmentId));
  }

  /** Latest segment id on disk when non-empty; otherwise `{todayUtc}-0001`. */
  async currentSegmentId(): Promise<string> {
    const ids = await this.listSegments();
    if (ids.length === 0) {
      return `${todayUtcDate()}-0001`;
    }
    const last = ids[ids.length - 1];
    return last!;
  }

  /** Sorted segment ids (oldest → newest). */
  async listSegments(): Promise<string[]> {
    const fs = await import("node:fs/promises");
    let names: string[] = [];
    try {
      names = await fs.readdir(this.baseDir);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return [];
      }
      throw e;
    }
    const ids: string[] = [];
    for (const name of names) {
      const m = SEGMENT_FILE_REGEX.exec(name);
      const id = m?.[1];
      if (typeof id === "string") {
        ids.push(id);
      }
    }
    ids.sort(compareSegmentId);
    return ids;
  }

  /**
   * Next segment id strictly after whatever exists on disk
   * (date rolls forward via UTC calendar; intra-day increments sequence).
   */
  async createNewSegment(): Promise<string> {
    const sorted = await this.listSegments();
    const today = todayUtcDate();

    let nextDate = today;
    let nextSeq = 1;

    if (sorted.length > 0) {
      const latest = sorted[sorted.length - 1];
      if (!latest) {
        return `${today}-0001`;
      }
      const parsed = parseSegmentId(latest);
      if (!parsed) {
        return `${today}-0001`;
      }

      const lastDate = parsed.date;
      const lastSeq = parsed.seq;

      if (lastDate >= today) {
        nextDate = lastDate;
        nextSeq = lastSeq + 1;
      } else {
        nextDate = today;
        nextSeq = 1;
      }
      if (!Number.isFinite(nextSeq) || nextSeq < 1 || nextSeq > 9999) {
        throw new Error("Segment sequence overflow (>9999) for audit ledger");
      }
    }

    return `${nextDate}-${String(nextSeq).padStart(4, "0")}`;
  }

  shouldRotate(
    entryCount: number,
    segmentStartTime: number,
    maxEntries: number,
    maxAgeMs: number,
  ): boolean {
    if (entryCount >= maxEntries) {
      return true;
    }
    return Date.now() - segmentStartTime >= maxAgeMs;
  }
}
