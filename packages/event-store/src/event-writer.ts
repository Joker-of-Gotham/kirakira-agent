import type Database from "better-sqlite3";
import fs from "node:fs";
import { ulid } from "ulid";
import type { RunEvent } from "./types.js";
import {
  ensureDirectory,
  openEventIndexDatabase,
  runDir,
  segmentFileName,
  segmentPath,
} from "./db.js";

export interface EventWriterOptions {
  basePath: string;
  maxSegmentBytes?: number;
}

export class EventWriter {
  private readonly basePath: string;
  private readonly maxSegmentBytes: number;
  private db: Database.Database;
  private seqCounters = new Map<string, number>();
  private segmentIndices = new Map<string, number>();

  constructor(options: EventWriterOptions) {
    this.basePath = options.basePath;
    this.maxSegmentBytes = options.maxSegmentBytes ?? 4 * 1024 * 1024;
    this.db = openEventIndexDatabase(this.basePath);
  }

  append(event: RunEvent): RunEvent {
    const id = event.id || ulid();
    const seq = this.nextSeq(event.runId);
    const stamped: RunEvent = {
      ...event,
      id,
      checkpointSeq: seq,
    };

    const dir = runDir(this.basePath, event.runId);
    ensureDirectory(dir);

    const segIdx = this.currentSegmentIndex(event.runId);
    const filePath = segmentPath(this.basePath, event.runId, segIdx);

    const line = JSON.stringify(stamped) + "\n";
    const offset = fs.existsSync(filePath)
      ? fs.statSync(filePath).size
      : 0;

    fs.appendFileSync(filePath, line, "utf8");

    this.db
      .prepare(
        `INSERT INTO events (id, run_id, seq, kind, timestamp, segment_file, line_offset, checkpoint_seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        event.runId,
        seq,
        event.kind,
        event.timestamp,
        segmentFileName(segIdx),
        offset,
        seq,
      );

    if (offset + line.length > this.maxSegmentBytes) {
      this.rotateSegment(event.runId);
    }

    return stamped;
  }

  emit(event: RunEvent): Promise<void> {
    this.append(event);
    return Promise.resolve();
  }

  close(): void {
    this.db.close();
  }

  private nextSeq(runId: string): number {
    const cur = this.seqCounters.get(runId) ?? 0;
    const next = cur + 1;
    this.seqCounters.set(runId, next);
    return next;
  }

  private currentSegmentIndex(runId: string): number {
    if (!this.segmentIndices.has(runId)) {
      this.segmentIndices.set(runId, 0);
    }
    return this.segmentIndices.get(runId)!;
  }

  private rotateSegment(runId: string): void {
    const cur = this.currentSegmentIndex(runId);
    this.segmentIndices.set(runId, cur + 1);
  }
}
