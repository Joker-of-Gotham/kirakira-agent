import Database from "better-sqlite3";
import type { AuditEvent } from "@kirakira/core";
import type { LedgerReader } from "./reader.js";

/** Secondary query index—not authoritative over JSONL on disk. */
export class AuditIndex {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.ensureSchema();
  }

  /** Table bootstrapping guarded by deterministic schema guardrail. */
  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_entries (
        event_id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        decision_id TEXT,
        segment TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_trace ON audit_entries(trace_id);
      CREATE INDEX IF NOT EXISTS idx_audit_decision ON audit_entries(decision_id);
      CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_entries(ts);
      CREATE INDEX IF NOT EXISTS idx_audit_kind_ts ON audit_entries(kind, ts);
    `);
  }

  /** Upsert deterministic JSON payloads for querying. */
  indexEvent(ev: AuditEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_entries (event_id, ts, trace_id, decision_id, segment, kind, payload)
      VALUES (@event_id, @ts, @trace_id, @decision_id, @segment, @kind, @payload)
      ON CONFLICT(event_id) DO UPDATE SET
        ts = excluded.ts,
        trace_id = excluded.trace_id,
        decision_id = excluded.decision_id,
        segment = excluded.segment,
        kind = excluded.kind,
        payload = excluded.payload
    `);
    stmt.run({
      event_id: ev.event_id,
      ts: ev.ts,
      trace_id: ev.trace_id,
      decision_id: ev.decision_id ?? null,
      segment: ev.segment,
      kind: ev.kind,
      payload: JSON.stringify(ev),
    });
  }

  queryByTraceId(traceId: string): AuditEvent[] {
    const rows = this.db
      .prepare(
        `SELECT payload FROM audit_entries WHERE trace_id = ? ORDER BY ts ASC`,
      )
      .all(traceId);
    return rows.map((row) =>
      JSON.parse((row as { payload: string }).payload) as AuditEvent,
    );
  }

  queryByDecisionId(decisionId: string): AuditEvent[] {
    const rows = this.db
      .prepare(
        `SELECT payload FROM audit_entries WHERE decision_id = ? ORDER BY ts ASC`,
      )
      .all(decisionId);
    return rows.map((row) =>
      JSON.parse((row as { payload: string }).payload) as AuditEvent,
    );
  }

  queryByTimeRange(since: string, until: string): AuditEvent[] {
    const rows = this.db
      .prepare(`SELECT payload FROM audit_entries WHERE ts >= ? AND ts <= ? ORDER BY ts ASC`)
      .all(since, until);
    return rows.map((row) =>
      JSON.parse((row as { payload: string }).payload) as AuditEvent,
    );
  }

  queryByKind(kind: string, limit = 10_000): AuditEvent[] {
    const capped = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100_000)) : 10_000;
    const rows = this.db
      .prepare(`SELECT payload FROM audit_entries WHERE kind = ? ORDER BY ts DESC LIMIT ?`)
      .all(kind, capped);
    return rows.map((row) =>
      JSON.parse((row as { payload: string }).payload) as AuditEvent,
    );
  }

  /** Truncate auxiliary index + rebuild verbatim from authoritative JSONL. */
  async rebuild(reader: LedgerReader): Promise<number> {
    this.db.exec(`DELETE FROM audit_entries;`);
    let count = 0;
    const insertStmt = this.db.prepare(`
      INSERT INTO audit_entries (event_id, ts, trace_id, decision_id, segment, kind, payload)
      VALUES (@event_id, @ts, @trace_id, @decision_id, @segment, @kind, @payload)
    `);
    let batch: AuditEvent[] = [];
    const flush = (): void => {
      const chunk = batch;
      batch = [];
      if (chunk.length === 0) {
        return;
      }
      const run = this.db.transaction((chunkRows: AuditEvent[]) => {
        for (const ev of chunkRows) {
          insertStmt.run({
            event_id: ev.event_id,
            ts: ev.ts,
            trace_id: ev.trace_id,
            decision_id: ev.decision_id ?? null,
            segment: ev.segment,
            kind: ev.kind,
            payload: JSON.stringify(ev),
          });
        }
      });
      run(chunk);
    };

    const segments = await reader.listSegmentIdsSorted();
    for (const segId of segments) {
      for await (const ev of reader.readSegment(segId)) {
        batch.push(ev);
        count += 1;
        if (batch.length >= 750) {
          flush();
        }
      }
    }
    flush();
    return count;
  }

  /** Close pooled sqlite handle cleanly. */
  close(): void {
    this.db.close();
  }
}
