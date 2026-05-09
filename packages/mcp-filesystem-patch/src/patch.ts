/**
 * Unified diff parse + apply (single- and multi-file), stats, and preview without writing.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveWorkspacePath } from "./snapshot.js";

export type PatchStats = {
  insertions: number;
  deletions: number;
  files_affected: number;
};

type Hunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  body: string[];
};

type FilePatchSection = {
  /** Workspace-relative normalized path */
  targetRel: string;
  /** Git "--- old" path hint */
  oldPathRaw: string;
  hunks: Hunk[];
};

function normalizeDiffPath(raw: string): string {
  let p = raw.trim();
  const tabs = p.indexOf("\t");
  if (tabs !== -1) p = p.slice(0, tabs).trim();
  for (const prefix of ["a/", "b/", "c/"]) {
    if (p.startsWith(prefix)) {
      p = p.slice(prefix.length);
      break;
    }
  }
  return path.normalize(p).replace(/\\/g, "/");
}

function countPatchLineStats(patch: string): Omit<PatchStats, "files_affected"> {
  let insertions = 0;
  let deletions = 0;
  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("@@")) continue;
    if (line.startsWith("+")) insertions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { insertions, deletions };
}

function parseHunkHeader(line: string): {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
} | null {
  const m = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/.exec(line);
  if (!m) return null;
  const oldStart = Number(m[1]);
  const oldCount = m[2] !== undefined ? Number(m[2]) : 1;
  const newStart = Number(m[3]);
  const newCount = m[4] !== undefined ? Number(m[4]) : 1;
  return { oldStart, oldCount, newStart, newCount };
}

function stripBodyTerminator(body: string[]): string[] {
  const out = [...body];
  while (out.length && out[out.length - 1] === "\\ No newline at end of file") {
    out.pop();
  }
  return out;
}

/** Split unified diff into per-file sections (best-effort Git-style). */
export function parseUnifiedPatch(patch: string): FilePatchSection[] {
  const lines = patch.split(/\r?\n/);
  const sections: FilePatchSection[] = [];
  let i = 0;

  while (i < lines.length) {
    while (i < lines.length && !lines[i].startsWith("--- ")) i++;
    if (i >= lines.length) break;
    const oldLine = lines[i++];
    if (!lines[i]?.startsWith("+++ ")) continue;
    const newLine = lines[i++];
    const oldPathRaw = oldLine.slice(4);
    const newPathRaw = newLine.slice(4);
    const targetRel = normalizeDiffPath(newPathRaw);

    const hunks: Hunk[] = [];
    while (i < lines.length) {
      if (lines[i].startsWith("--- ")) break;
      const hdr = parseHunkHeader(lines[i]);
      if (!hdr) {
        i++;
        continue;
      }
      i++;
      const body: string[] = [];
      while (i < lines.length) {
        const L = lines[i];
        if (L.startsWith("@@")) break;
        if (L.startsWith("--- ") || L.startsWith("+++ ")) break;
        if (
          L.startsWith("diff --git ") ||
          L.startsWith("index ") ||
          L.startsWith("similarity ") ||
          L.startsWith("rename ") ||
          L.startsWith("Binary files ")
        ) {
          i++;
          continue;
        }
        if (L === "\\ No newline at end of file" || /^[ +-\\]/.test(L) || L === "") {
          body.push(L);
          i++;
          continue;
        }
        break;
      }
      hunks.push({
        oldStart: hdr.oldStart,
        oldCount: hdr.oldCount,
        newStart: hdr.newStart,
        newCount: hdr.newCount,
        body: stripBodyTerminator(body),
      });
    }

    sections.push({ targetRel, oldPathRaw, hunks });
  }

  return sections;
}

export function splitLines(content: string): string[] {
  if (content === "") return [];
  const normalized = content.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

export function joinLines(lines: string[]): string {
  if (lines.length === 0) return "";
  return `${lines.join("\n")}\n`;
}

function applySingleHunk(lines: string[], hunk: Hunk): string[] {
  const body = hunk.body.filter((row) => row !== "\\ No newline at end of file");
  /** Position in old lines (0-based). `@@ -0,0` anchors before the first line. */
  let oldIdx = hunk.oldStart === 0 ? 0 : hunk.oldStart - 1;
  if (oldIdx > lines.length) {
    throw new Error(`Hunk starts past end of file (${oldIdx + 1})`);
  }

  const before = lines.slice(0, oldIdx);
  const out: string[] = [...before];
  let ai = oldIdx;

  for (const row of body) {
    if (row === "") continue;
    const prefix = row[0];
    const text = row.slice(1);
    if (prefix === " ") {
      if (ai >= lines.length || lines[ai] !== text) {
        throw new Error(`Patch context mismatch at line ${ai + 1}`);
      }
      out.push(lines[ai]);
      ai++;
    } else if (prefix === "-") {
      if (ai >= lines.length || lines[ai] !== text) {
        throw new Error(`Patch remove mismatch at line ${ai + 1}`);
      }
      ai++;
    } else if (prefix === "+") {
      out.push(text);
    } else {
      throw new Error(`Unexpected patch line: ${JSON.stringify(row.slice(0, 8))}`);
    }
  }

  out.push(...lines.slice(ai));
  return out;
}

function applyAllHunks(originalLines: string[], hunks: Hunk[]): string[] {
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart);
  let cur = originalLines;
  for (const h of sorted) {
    cur = applySingleHunk(cur, h);
  }
  return cur;
}

function isNewFile(section: FilePatchSection): boolean {
  const o = section.oldPathRaw.trim();
  return o === "/dev/null" || o === "NUL" || o.endsWith("/dev/null");
}

/** Build a readable unified diff between two file contents (context-aware chunk). */
export function buildUnifiedFileDiff(relPath: string, oldContent: string, newContent: string): string {
  const oldLines = splitLines(oldContent.replace(/\r\n/g, "\n"));
  const newLines = splitLines(newContent.replace(/\r\n/g, "\n"));

  if (oldLines.join("\n") === newLines.join("\n")) return "";

  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
    i++;
    j++;
  }
  let ei = oldLines.length;
  let ej = newLines.length;
  while (ei > i && ej > j && oldLines[ei - 1] === newLines[ej - 1]) {
    ei--;
    ej--;
  }

  const ctx = 3;
  const sOld = Math.max(0, i - ctx);
  const eOld = Math.min(oldLines.length, ei + ctx);
  const sNew = Math.max(0, j - ctx);
  const eNew = Math.min(newLines.length, ej + ctx);

  const oldChunk = oldLines.slice(i, ei);
  const newChunk = newLines.slice(j, ej);

  const out: string[] = [`--- a/${relPath}`, `+++ b/${relPath}`];
  const oldSpan = eOld - sOld;
  const newSpan = eNew - sNew;
  out.push(`@@ -${sOld + 1},${oldSpan} +${sNew + 1},${newSpan} @@`);

  for (let k = sOld; k < i; k++) out.push(` ${oldLines[k]}`);
  for (const l of oldChunk) out.push(`-${l}`);
  for (const l of newChunk) out.push(`+${l}`);
  for (let k = ei; k < eOld; k++) out.push(` ${oldLines[k]}`);

  return `${out.join("\n")}\n`;
}

export type ApplyPreviewResult = {
  can_apply: boolean;
  diff: string;
  files_affected: number;
  insertions: number;
  deletions: number;
  /** Relative path -> new content (when can_apply) */
  pendingWrites?: Map<string, string>;
  error?: string;
};

export function previewPatch(workspaceRoot: string, _anchorPath: string, patch: string): ApplyPreviewResult {
  const baseStats = countPatchLineStats(patch);
  const sections = parseUnifiedPatch(patch);
  if (sections.length === 0) {
    return {
      can_apply: false,
      diff: "",
      files_affected: 0,
      insertions: baseStats.insertions,
      deletions: baseStats.deletions,
      error: "No unified diff file sections found",
    };
  }

  const pending = new Map<string, string>();
  try {
    for (const sec of sections) {
      const rel = sec.targetRel;
      const abs = resolveWorkspacePath(workspaceRoot, rel);

      if (isNewFile(sec)) {
        const lines = applyAllHunks([], sec.hunks);
        pending.set(rel, joinLines(lines));
        continue;
      }

      if (!fs.existsSync(abs)) {
        throw new Error(`Target file missing for patch: ${rel}`);
      }
      if (fs.statSync(abs).isDirectory()) {
        throw new Error(`Patch target is a directory: ${rel}`);
      }
      const raw = fs.readFileSync(abs, "utf8");
      const originalLines = splitLines(raw.replace(/\r\n/g, "\n"));
      const newLines = applyAllHunks(originalLines, sec.hunks);
      pending.set(rel, joinLines(newLines));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      can_apply: false,
      diff: "",
      files_affected: sections.length,
      insertions: baseStats.insertions,
      deletions: baseStats.deletions,
      error: msg,
    };
  }

  const diffParts: string[] = [];
  for (const sec of sections) {
    const rel = sec.targetRel;
    const abs = resolveWorkspacePath(workspaceRoot, rel);
    const oldContent = isNewFile(sec) ? "" : fs.readFileSync(abs, "utf8");
    const newContent = pending.get(rel) ?? "";
    diffParts.push(buildUnifiedFileDiff(rel, oldContent, newContent));
  }

  return {
    can_apply: true,
    diff: diffParts.join("\n").trimEnd(),
    files_affected: sections.length,
    insertions: baseStats.insertions,
    deletions: baseStats.deletions,
    pendingWrites: pending,
  };
}

export type ApplyResult = {
  applied: boolean;
  files_changed: number;
  insertions: number;
  deletions: number;
  error?: string;
};

export function applyPatch(workspaceRoot: string, anchorPath: string, patch: string): ApplyResult {
  const preview = previewPatch(workspaceRoot, anchorPath, patch);
  if (!preview.can_apply || !preview.pendingWrites) {
    return {
      applied: false,
      files_changed: preview.files_affected,
      insertions: preview.insertions,
      deletions: preview.deletions,
      error: preview.error ?? "Cannot apply patch",
    };
  }

  try {
    for (const [rel, content] of preview.pendingWrites) {
      const abs = resolveWorkspacePath(workspaceRoot, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, "utf8");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      applied: false,
      files_changed: preview.files_affected,
      insertions: preview.insertions,
      deletions: preview.deletions,
      error: msg,
    };
  }

  return {
    applied: true,
    files_changed: preview.pendingWrites.size,
    insertions: preview.insertions,
    deletions: preview.deletions,
  };
}

export function diffText(a: string, b: string, labelA: string, labelB: string): { diff: string; identical: boolean } {
  if (a === b) return { diff: "", identical: true };
  const d = buildUnifiedFileDiff(`${labelA}→${labelB}`, a, b);
  return { diff: d, identical: false };
}
