import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type { Artifact, ArtifactRef } from "../types.js";

interface ArtifactRow {
  id: string;
  workspace_id: string;
  name: string;
  rel_path: string;
  mime_type: string;
  size: number;
  hash: string;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

export class ArtifactStore {
  private readonly db: Database.Database;
  private readonly blobDir: string;

  constructor(workspaceRoot: string) {
    const root = path.join(workspaceRoot, ".kirakira-artifacts");
    this.blobDir = path.join(root, "blobs");
    const dbPath = path.join(root, "metadata.sqlite");
    fs.mkdirSync(this.blobDir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY NOT NULL,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        rel_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_workspace ON artifacts(workspace_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  create(
    name: string,
    content: Buffer | string,
    mimeType: string,
    workspaceId = "default",
  ): Artifact {
    const id = randomBytes(16).toString("hex");
    const body = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    const hash = createHash("sha256").update(body).digest("hex");
    const rel = path.join(id.slice(0, 2), id);
    const now = new Date().toISOString();
    const filePath = path.join(this.blobDir, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, body);
    this.db
      .prepare(
        `INSERT INTO artifacts (id, workspace_id, name, rel_path, mime_type, size, hash, created_at, updated_at, metadata_json)
         VALUES (@id, @workspace_id, @name, @rel_path, @mime_type, @size, @hash, @created_at, @updated_at, @metadata_json)`,
      )
      .run({
        id,
        workspace_id: workspaceId,
        name,
        rel_path: rel,
        mime_type: mimeType,
        size: body.length,
        hash,
        created_at: now,
        updated_at: now,
        metadata_json: null,
      });
    return {
      id,
      name,
      path: filePath,
      mimeType,
      size: body.length,
      hash,
      createdAt: now,
      updatedAt: now,
    };
  }

  get(id: string): Artifact | null {
    const row = this.db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id) as
      | ArtifactRow
      | undefined;
    if (!row) return null;
    return this.rowToArtifact(row);
  }

  list(workspaceId: string): Artifact[] {
    const rows = this.db.prepare(`SELECT * FROM artifacts WHERE workspace_id = ?`).all(workspaceId) as ArtifactRow[];
    return rows.map((r) => this.rowToArtifact(r));
  }

  ref(artifact: Artifact): ArtifactRef {
    return {
      id: artifact.id,
      name: artifact.name,
      mimeType: artifact.mimeType,
      size: artifact.size,
      hash: artifact.hash,
      createdAt: artifact.createdAt,
      ...(artifact.metadata !== undefined ? { metadata: artifact.metadata } : {}),
    };
  }

  private rowToArtifact(row: ArtifactRow): Artifact {
    const filePath = path.join(this.blobDir, row.rel_path);
    return {
      id: row.id,
      name: row.name,
      path: filePath,
      mimeType: row.mime_type,
      size: row.size,
      hash: row.hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.metadata_json
        ? { metadata: JSON.parse(row.metadata_json) as Record<string, unknown> }
        : {}),
    };
  }
}
