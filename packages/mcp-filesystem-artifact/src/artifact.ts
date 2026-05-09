import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type ArtifactMeta = {
  artifact_id: string;
  name: string;
  mime: string;
  tags: string[];
  created_at: string;
  size: number;
  hash: string;
};

function artifactsRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".kirakira", "artifacts");
}

export function ensureArtifactsDir(workspaceRoot: string): string {
  const root = artifactsRoot(workspaceRoot);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function shortRandom(): string {
  return createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12);
}

export function makeArtifactId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}_${shortRandom()}`;
}

export function artifactDir(workspaceRoot: string, artifactId: string): string {
  return path.join(artifactsRoot(workspaceRoot), artifactId);
}

export function writeArtifact(
  workspaceRoot: string,
  content: string,
  name: string,
  mime?: string,
  tags?: string[],
): { artifact_id: string; path: string; size: number; hash: string } {
  ensureArtifactsDir(workspaceRoot);
  const artifact_id = makeArtifactId();
  const dir = artifactDir(workspaceRoot, artifact_id);
  fs.mkdirSync(dir, { recursive: true });

  const buf = Buffer.from(content, "utf8");
  const hash = createHash("sha256").update(buf).digest("hex");
  const dataPath = path.join(dir, "content.bin");
  fs.writeFileSync(dataPath, buf);

  const meta: ArtifactMeta = {
    artifact_id,
    name,
    mime: mime ?? "text/plain; charset=utf-8",
    tags: tags ?? [],
    created_at: new Date().toISOString(),
    size: buf.byteLength,
    hash,
  };
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

  return {
    artifact_id,
    path: path.relative(workspaceRoot, dataPath),
    size: meta.size,
    hash,
  };
}

export function readArtifactMeta(workspaceRoot: string, artifactId: string): ArtifactMeta {
  const fp = path.join(artifactDir(workspaceRoot, artifactId), "meta.json");
  if (!fs.existsSync(fp)) throw new Error(`Unknown artifact_id: ${artifactId}`);
  return JSON.parse(fs.readFileSync(fp, "utf8")) as ArtifactMeta;
}

export function readArtifactPreview(workspaceRoot: string, artifactId: string, maxChars = 512): string {
  const dataPath = path.join(artifactDir(workspaceRoot, artifactId), "content.bin");
  if (!fs.existsSync(dataPath)) throw new Error(`Artifact content missing: ${artifactId}`);
  const slice = Buffer.allocUnsafe(Math.min(maxChars * 4, fs.statSync(dataPath).size));
  const fd = fs.openSync(dataPath, "r");
  try {
    const n = fs.readSync(fd, slice, 0, slice.length, 0);
    const txt = slice.subarray(0, n).toString("utf8");
    return txt.length > maxChars ? txt.slice(0, maxChars) + "…" : txt;
  } finally {
    fs.closeSync(fd);
  }
}

export type ArtifactListEntry = {
  id: string;
  name: string;
  size: number;
  mime: string;
  created_at: string;
};

export function listArtifacts(
  workspaceRoot: string,
  tag?: string,
  limit = 100,
): ArtifactListEntry[] {
  const root = artifactsRoot(workspaceRoot);
  if (!fs.existsSync(root)) return [];

  const out: ArtifactListEntry[] = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const metaPath = path.join(root, ent.name, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(metaPath, "utf8")) as ArtifactMeta;
      if (tag !== undefined && tag !== "" && !m.tags.includes(tag)) continue;
      out.push({
        id: m.artifact_id,
        name: m.name,
        size: m.size,
        mime: m.mime,
        created_at: m.created_at,
      });
    } catch {
      /* skip */
    }
  }
  out.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const lim = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 10_000)) : 100;
  return out.slice(0, lim);
}
