import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type SnapshotMeta = {
  snapshot_id: string;
  source_abs: string;
  relative_path: string;
  created_at: string;
  size: number;
  is_directory: boolean;
};

function snapshotsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".kirakira", "snapshots");
}

export function ensureSnapshotsDir(workspaceRoot: string): string {
  const root = snapshotsRoot(workspaceRoot);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function resolveWorkspacePath(workspaceRoot: string, userPath: string): string {
  const abs = path.resolve(workspaceRoot, userPath);
  const root = path.resolve(workspaceRoot);
  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(normalizedRoot)) {
    throw new Error(`Path escapes workspace: ${userPath}`);
  }
  return abs;
}

function dirSizeSync(dir: string): number {
  let total = 0;
  const st = fs.statSync(dir);
  if (!st.isDirectory()) return st.size;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) total += dirSizeSync(p);
    else total += fs.statSync(p).size;
  }
  return total;
}

function computeEntrySize(absPath: string, isDir: boolean): number {
  if (!isDir) return fs.statSync(absPath).size;
  return dirSizeSync(absPath);
}

function shortHash(parts: string[]): string {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 12);
}

export function makeSnapshotId(relativePath: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const hash = shortHash([relativePath, String(Date.now()), String(Math.random())]);
  return `${ts}_${hash}`;
}

export function snapshotDir(workspaceRoot: string, snapshotId: string): string {
  return path.join(snapshotsRoot(workspaceRoot), snapshotId);
}

export function writeMeta(workspaceRoot: string, meta: SnapshotMeta): void {
  const dir = snapshotDir(workspaceRoot, meta.snapshot_id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
}

export function readMeta(workspaceRoot: string, snapshotId: string): SnapshotMeta {
  const fp = path.join(snapshotDir(workspaceRoot, snapshotId), "meta.json");
  if (!fs.existsSync(fp)) {
    throw new Error(`Unknown snapshot_id: ${snapshotId}`);
  }
  const raw = fs.readFileSync(fp, "utf8");
  return JSON.parse(raw) as SnapshotMeta;
}

export function mirrorDir(workspaceRoot: string, snapshotId: string): string {
  return path.join(snapshotDir(workspaceRoot, snapshotId), "mirror");
}

/** Deep-copy file or directory under snapshot mirror preserving workspace-relative layout. */
export function createSnapshot(workspaceRoot: string, userPath: string): SnapshotMeta {
  const abs = resolveWorkspacePath(workspaceRoot, userPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Path does not exist: ${userPath}`);
  }
  const st = fs.statSync(abs);
  const isDir = st.isDirectory();
  const resolvedWs = path.resolve(workspaceRoot);
  let rel = path.relative(resolvedWs, abs);
  if (rel === "") rel = ".";

  const snapshot_id = makeSnapshotId(rel);
  ensureSnapshotsDir(workspaceRoot);
  const destMirrorRoot = mirrorDir(workspaceRoot, snapshot_id);
  fs.mkdirSync(destMirrorRoot, { recursive: true });

  if (rel === ".") {
    for (const name of fs.readdirSync(abs)) {
      if (name === ".kirakira") continue;
      const s = path.join(abs, name);
      const d = path.join(destMirrorRoot, name);
      fs.cpSync(s, d, { recursive: true });
    }
  } else {
    const mirrorTarget = path.join(destMirrorRoot, rel);
    fs.mkdirSync(path.dirname(mirrorTarget), { recursive: true });
    fs.cpSync(abs, mirrorTarget, { recursive: true });
  }

  const meta: SnapshotMeta = {
    snapshot_id,
    source_abs: abs,
    relative_path: rel,
    created_at: new Date().toISOString(),
    size: computeEntrySize(abs, isDir),
    is_directory: isDir,
  };
  writeMeta(workspaceRoot, meta);
  return meta;
}

export type SnapshotListEntry = {
  id: string;
  path: string;
  created_at: string;
  size: number;
};

export function listSnapshots(workspaceRoot: string, filterPath?: string): SnapshotListEntry[] {
  const root = snapshotsRoot(workspaceRoot);
  if (!fs.existsSync(root)) return [];

  let filtNorm: string | undefined;
  if (filterPath !== undefined && filterPath !== "") {
    filtNorm = path.normalize(filterPath).replace(/\\/g, "/");
  }

  const out: SnapshotListEntry[] = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const metaPath = path.join(root, ent.name, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as SnapshotMeta;
      const listedPath = meta.relative_path;
      if (filtNorm !== undefined) {
        const fp = path.normalize(listedPath).replace(/\\/g, "/");
        const f = filtNorm;
        if (!(fp === f || fp.startsWith(f + "/") || f.startsWith(fp + "/"))) continue;
      }
      out.push({
        id: meta.snapshot_id,
        path: listedPath === "." ? "." : listedPath,
        created_at: meta.created_at,
        size: meta.size,
      });
    } catch {
      /* skip corrupt */
    }
  }
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return out;
}

export function rollbackSnapshot(workspaceRoot: string, snapshotId: string): SnapshotMeta {
  const meta = readMeta(workspaceRoot, snapshotId);
  const mRoot = mirrorDir(workspaceRoot, snapshotId);
  if (!fs.existsSync(mRoot)) {
    throw new Error(`Snapshot mirror missing for ${snapshotId}`);
  }

  if (meta.relative_path === ".") {
    const destWs = path.resolve(workspaceRoot);
    for (const name of fs.readdirSync(mRoot)) {
      const s = path.join(mRoot, name);
      const d = path.join(destWs, name);
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.cpSync(s, d, { recursive: true });
    }
  } else {
    const srcMirror = path.join(mRoot, meta.relative_path);
    if (!fs.existsSync(srcMirror)) {
      throw new Error(`Snapshot mirror missing for ${snapshotId}`);
    }
    const dest = meta.source_abs;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.cpSync(srcMirror, dest, { recursive: true });
  }
  return meta;
}

/** Read a UTF-8 file as it existed in the snapshot; `fileRelativePath` is relative to workspace root. */
export function readSnapshottedFile(
  workspaceRoot: string,
  snapshotId: string,
  fileRelativePath: string,
): string {
  const meta = readMeta(workspaceRoot, snapshotId);
  const mRoot = mirrorDir(workspaceRoot, snapshotId);
  const rel = path.normalize(fileRelativePath);
  if (rel.startsWith(".." + path.sep) || rel === "..") {
    throw new Error("Invalid relative path");
  }
  const candidate = path.resolve(path.join(mRoot, rel));
  const boundary = path.resolve(mRoot);
  const boundarySep = boundary.endsWith(path.sep) ? boundary : boundary + path.sep;
  if (candidate !== boundary && !candidate.startsWith(boundarySep)) {
    throw new Error("Path escapes snapshot mirror");
  }
  if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
    throw new Error(`Snapshot file not found: ${fileRelativePath}`);
  }
  return fs.readFileSync(candidate, "utf8");
}
