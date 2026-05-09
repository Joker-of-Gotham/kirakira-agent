import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

export function resolveEventStoreBasePath(basePath?: string): string {
  if (basePath !== undefined && basePath.length > 0) {
    return path.resolve(basePath);
  }
  return path.join(homedir(), ".kirakira-agent", "events");
}

export function indexDbPath(basePath: string): string {
  return path.join(basePath, "_index.sqlite");
}

export function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function openEventIndexDatabase(basePath: string): Database.Database {
  ensureDirectory(basePath);
  const dbPath = indexDbPath(basePath);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 8000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      kind TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      segment_file TEXT NOT NULL,
      line_offset INTEGER NOT NULL,
      checkpoint_seq INTEGER,
      UNIQUE(run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_events_run_id_seq ON events(run_id, seq);
    CREATE INDEX IF NOT EXISTS idx_events_run_id_kind ON events(run_id, kind);
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY NOT NULL,
      run_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      state_json TEXT NOT NULL,
      event_id_up_to TEXT NOT NULL,
      UNIQUE(run_id, seq)
    );
    CREATE INDEX IF NOT EXISTS idx_checkpoints_run_id_seq ON checkpoints(run_id, seq);
    CREATE TABLE IF NOT EXISTS run_segment_hint (
      run_id TEXT PRIMARY KEY NOT NULL,
      pending_rotate INTEGER NOT NULL
    );
  `);
  return db;
}

export function segmentFileName(segmentIndex: number): string {
  return `${segmentIndex.toString().padStart(8, "0")}.jsonl`;
}

export function parseSegmentIndex(segmentFile: string): number {
  const base = path.basename(segmentFile);
  const n = Number.parseInt(base.replace(/\.jsonl$/i, ""), 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`Invalid segment file: ${segmentFile}`);
  }
  return n;
}

export function runDir(basePath: string, runId: string): string {
  return path.join(basePath, runId);
}

export function segmentPath(basePath: string, runId: string, segmentIndex: number): string {
  return path.join(runDir(basePath, runId), segmentFileName(segmentIndex));
}

export function readLineAtOffset(filePath: string, byteOffset: number): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const st = fs.fstatSync(fd);
    const toRead = Math.min(1024 * 64, Math.max(1, st.size - byteOffset));
    const buf = Buffer.alloc(toRead);
    const read = fs.readSync(fd, buf, 0, toRead, byteOffset);
    const slice = buf.subarray(0, read);
    const nl = slice.indexOf(0x0a);
    const end = nl === -1 ? slice.length : nl;
    return slice.subarray(0, end).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}
