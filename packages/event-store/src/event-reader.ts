import type Database from "better-sqlite3";
import type { RunEvent, EventFilter } from "./types.js";
import { openEventIndexDatabase, segmentPath, readLineAtOffset } from "./db.js";

export class EventReader {
  private readonly basePath: string;
  private db: Database.Database;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.db = openEventIndexDatabase(basePath);
  }

  readAll(runId: string): RunEvent[] {
    const rows = this.db
      .prepare(
        `SELECT segment_file, line_offset FROM events WHERE run_id = ? ORDER BY seq ASC`,
      )
      .all(runId) as Array<{ segment_file: string; line_offset: number }>;

    return rows.map((r) => this.readEvent(runId, r.segment_file, r.line_offset));
  }

  readRange(runId: string, fromSeq: number, toSeq: number): RunEvent[] {
    const rows = this.db
      .prepare(
        `SELECT segment_file, line_offset FROM events
         WHERE run_id = ? AND seq >= ? AND seq <= ?
         ORDER BY seq ASC`,
      )
      .all(runId, fromSeq, toSeq) as Array<{ segment_file: string; line_offset: number }>;

    return rows.map((r) => this.readEvent(runId, r.segment_file, r.line_offset));
  }

  readSinceCheckpoint(runId: string, checkpointSeq: number): RunEvent[] {
    const rows = this.db
      .prepare(
        `SELECT segment_file, line_offset FROM events
         WHERE run_id = ? AND seq > ?
         ORDER BY seq ASC`,
      )
      .all(runId, checkpointSeq) as Array<{ segment_file: string; line_offset: number }>;

    return rows.map((r) => this.readEvent(runId, r.segment_file, r.line_offset));
  }

  filter(filter: EventFilter): RunEvent[] {
    let sql = `SELECT segment_file, line_offset, run_id FROM events WHERE 1=1`;
    const params: unknown[] = [];

    if (filter.runId) {
      sql += ` AND run_id = ?`;
      params.push(filter.runId);
    }
    if (filter.kinds && filter.kinds.length > 0) {
      sql += ` AND kind IN (${filter.kinds.map(() => "?").join(",")})`;
      params.push(...filter.kinds);
    }
    if (filter.after) {
      sql += ` AND timestamp > ?`;
      params.push(filter.after);
    }
    if (filter.before) {
      sql += ` AND timestamp < ?`;
      params.push(filter.before);
    }
    sql += ` ORDER BY seq ASC`;
    if (filter.limit) {
      sql += ` LIMIT ?`;
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Array<{
      segment_file: string;
      line_offset: number;
      run_id: string;
    }>;

    return rows.map((r) => this.readEvent(r.run_id, r.segment_file, r.line_offset));
  }

  async *stream(runId: string): AsyncGenerator<RunEvent> {
    const events = this.readAll(runId);
    for (const e of events) {
      yield e;
    }
  }

  close(): void {
    this.db.close();
  }

  private readEvent(runId: string, segmentFile: string, lineOffset: number): RunEvent {
    const idx = Number.parseInt(segmentFile.replace(/\.jsonl$/i, ""), 10);
    const filePath = segmentPath(this.basePath, runId, idx);
    const line = readLineAtOffset(filePath, lineOffset);
    return JSON.parse(line) as RunEvent;
  }
}
