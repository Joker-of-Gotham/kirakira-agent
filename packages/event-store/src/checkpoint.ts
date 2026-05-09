import type Database from "better-sqlite3";
import { ulid } from "ulid";
import type { Checkpoint, RunState } from "./types.js";
import { stableStringify } from "./types.js";
import { openEventIndexDatabase } from "./db.js";

export class CheckpointManager {
  private db: Database.Database;

  constructor(basePath: string) {
    this.db = openEventIndexDatabase(basePath);
  }

  save(runId: string, state: RunState, lastEventId: string): Checkpoint {
    const id = ulid();
    const seq = (state.checkpoint.lastCheckpointSeq ?? 0) + 1;
    const timestamp = new Date().toISOString();
    const snapshot = structuredClone(state) as RunState;
    const stateJson = stableStringify(snapshot);

    this.db
      .prepare(
        `INSERT INTO checkpoints (id, run_id, seq, timestamp, state_json, event_id_up_to)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, runId, seq, timestamp, stateJson, lastEventId);

    return {
      id,
      runId,
      seq,
      timestamp,
      state: snapshot,
      eventIdUpTo: lastEventId,
    };
  }

  load(runId: string): Checkpoint | null {
    const row = this.db
      .prepare(
        `SELECT id, run_id, seq, timestamp, state_json, event_id_up_to
         FROM checkpoints WHERE run_id = ? ORDER BY seq DESC LIMIT 1`,
      )
      .get(runId) as
      | { id: string; run_id: string; seq: number; timestamp: string; state_json: string; event_id_up_to: string }
      | undefined;

    if (!row) return null;
    return this.rowToCheckpoint(row);
  }

  loadById(checkpointId: string): Checkpoint | null {
    const row = this.db
      .prepare(
        `SELECT id, run_id, seq, timestamp, state_json, event_id_up_to
         FROM checkpoints WHERE id = ?`,
      )
      .get(checkpointId) as
      | { id: string; run_id: string; seq: number; timestamp: string; state_json: string; event_id_up_to: string }
      | undefined;

    if (!row) return null;
    return this.rowToCheckpoint(row);
  }

  listCheckpoints(runId: string): Checkpoint[] {
    const rows = this.db
      .prepare(
        `SELECT id, run_id, seq, timestamp, state_json, event_id_up_to
         FROM checkpoints WHERE run_id = ? ORDER BY seq ASC`,
      )
      .all(runId) as Array<{
      id: string;
      run_id: string;
      seq: number;
      timestamp: string;
      state_json: string;
      event_id_up_to: string;
    }>;

    return rows.map((r) => this.rowToCheckpoint(r));
  }

  close(): void {
    this.db.close();
  }

  private rowToCheckpoint(row: {
    id: string;
    run_id: string;
    seq: number;
    timestamp: string;
    state_json: string;
    event_id_up_to: string;
  }): Checkpoint {
    return {
      id: row.id,
      runId: row.run_id,
      seq: row.seq,
      timestamp: row.timestamp,
      state: JSON.parse(row.state_json) as RunState,
      eventIdUpTo: row.event_id_up_to,
    };
  }
}
