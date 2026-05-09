import { createHash } from "blake3";
import type { LedgerReader } from "./reader.js";

export interface CheckpointResult {
  segment: string;
  firstEventId: string;
  lastEventId: string;
  entries: number;
  rootHash: string;
}

/**
 * Checkpoint over a contiguous segment snapshot: BLAKE3-256 over the ordered
 * ASCII concatenation of `entry_hash` hex digests (`h0 || h1 || ...`).
 */
export async function generateCheckpoint(
  reader: LedgerReader,
  segmentId: string,
): Promise<CheckpointResult> {
  let entries = 0;
  let firstEventId = "";
  let lastEventId = "";
  const concatHasher = createHash();

  for await (const ev of reader.readSegment(segmentId)) {
    if (!ev.entry_hash) {
      throw new Error(`Malformed audit row missing entry_hash (${ev.event_id})`);
    }
    if (entries === 0) {
      firstEventId = ev.event_id;
    }
    lastEventId = ev.event_id;
    concatHasher.update(Buffer.from(ev.entry_hash, "utf8"));
    entries += 1;
  }

  if (entries === 0) {
    throw new Error(`Cannot checkpoint empty ledger segment '${segmentId}'`);
  }

  return {
    segment: segmentId,
    firstEventId,
    lastEventId,
    entries,
    rootHash: concatHasher.digest("hex"),
  };
}
