import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { isPathWithin, sha256Hex } from "@kirakira/core";

import type {
  ResearchEvidence,
  ResearchSourceAdapter,
  ResearchSourceRequest,
} from "./types.js";

export interface FileSourceAdapterOptions {
  workspaceRoot: string;
  roots?: readonly string[];
  includeExtensions?: readonly string[];
  excludeNames?: readonly string[];
  maxFiles?: number;
  maxFileBytes?: number;
  maxEvidence?: number;
  retrievedAt?: string | (() => string);
}

export const DEFAULT_FILE_SOURCE_EXCLUDE_NAMES = [
  ".git",
  ".turbo",
  ".next",
  "coverage",
  "dist",
  "node_modules",
] as const;

const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const DEFAULT_MAX_EVIDENCE = 8;

interface CandidateFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

interface FileMatch {
  file: CandidateFile;
  score: number;
  matchedTokens: string[];
  lineNumbers: number[];
  snippets: string[];
}

export function fileProviderFromWorkspace(
  options: FileSourceAdapterOptions,
): ResearchSourceAdapter {
  const workspaceRoot = resolve(options.workspaceRoot);
  return {
    kind: "file",
    async search(request) {
      const candidates = await collectCandidateFiles(workspaceRoot, options);
      const tokens = tokenize(request.query);
      const matches: FileMatch[] = [];
      for (const file of candidates) {
        const match = await matchFile(file, request, tokens);
        if (match) matches.push(match);
      }
      return matches
        .sort((left, right) =>
          right.score === left.score
            ? left.file.relativePath.localeCompare(right.file.relativePath)
            : right.score - left.score,
        )
        .slice(0, evidenceLimit(request, options))
        .map((match) => fileEvidence(match, request, options));
    },
  };
}

async function collectCandidateFiles(
  workspaceRoot: string,
  options: FileSourceAdapterOptions,
): Promise<CandidateFile[]> {
  const roots = options.roots?.length ? options.roots : ["."];
  const out: CandidateFile[] = [];
  const maxFiles = positiveInteger(options.maxFiles, DEFAULT_MAX_FILES);
  const excludeNames = new Set(options.excludeNames ?? DEFAULT_FILE_SOURCE_EXCLUDE_NAMES);
  const includeExtensions = normalizedExtensions(options.includeExtensions);

  for (const root of roots) {
    const start = resolveInsideWorkspace(workspaceRoot, root);
    await walk(start);
    if (out.length >= maxFiles) break;
  }
  return out;

  async function walk(directory: string): Promise<void> {
    if (out.length >= maxFiles) return;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (out.length >= maxFiles) return;
      if (excludeNames.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = extname(entry.name).toLowerCase();
      if (includeExtensions && !includeExtensions.has(extension)) continue;
      const fileStat = await stat(absolutePath);
      if (fileStat.size > positiveInteger(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES)) {
        continue;
      }
      out.push({
        absolutePath,
        relativePath: workspaceRelativePath(workspaceRoot, absolutePath),
        size: fileStat.size,
      });
    }
  }
}

function resolveInsideWorkspace(workspaceRoot: string, userPath: string): string {
  const absolutePath = resolve(workspaceRoot, userPath);
  if (!isPathWithin(workspaceRoot, absolutePath)) {
    throw new Error(`deep_research file source path escapes workspace root: ${userPath}`);
  }
  return absolutePath;
}

async function matchFile(
  file: CandidateFile,
  request: ResearchSourceRequest,
  queryTokens: string[],
): Promise<FileMatch | undefined> {
  const raw = await readFile(file.absolutePath);
  if (!looksLikeText(raw)) return undefined;
  const content = raw.toString("utf8");
  const haystack = `${file.relativePath}\n${content}`.toLowerCase();
  const matchedTokens = queryTokens.filter((token) => haystack.includes(token));
  if (matchedTokens.length === 0) return undefined;

  const lines = content.split(/\r?\n/);
  const snippets: string[] = [];
  const lineNumbers: number[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const normalized = line.toLowerCase();
    if (!matchedTokens.some((token) => normalized.includes(token))) continue;
    const lineNumber = index + 1;
    lineNumbers.push(lineNumber);
    snippets.push(`L${lineNumber}: ${line.trim()}`.slice(0, 320));
    if (snippets.length >= 4) break;
  }
  const pathScore = matchedTokens.filter((token) =>
    file.relativePath.toLowerCase().includes(token),
  ).length;
  const lineScore = lineNumbers.length;
  const citationBonus = request.requireCitations ? 1 : 0;
  return {
    file,
    matchedTokens,
    snippets,
    lineNumbers,
    score: matchedTokens.length * 10 + pathScore * 3 + lineScore + citationBonus,
  };
}

function fileEvidence(
  match: FileMatch,
  request: ResearchSourceRequest,
  options: FileSourceAdapterOptions,
): ResearchEvidence {
  const firstLine = match.lineNumbers[0] ?? 1;
  const evidenceId = `file-evidence:${sha256Hex(`${match.file.relativePath}:${request.query}`).slice(0, 16)}`;
  const citationId = `file:${sha256Hex(`${match.file.relativePath}:${firstLine}`).slice(0, 16)}`;
  return {
    id: evidenceId,
    sourceKind: "file",
    query: request.query,
    title: match.file.relativePath,
    summary: `Matched ${match.matchedTokens.length} query token(s) in ${match.file.relativePath}.`,
    content: match.snippets.join("\n"),
    confidence: Math.min(0.99, match.score / 100),
    citations: [
      {
        id: citationId,
        sourceKind: "file",
        title: match.file.relativePath,
        uri: `workspace://${encodeWorkspacePath(match.file.relativePath)}`,
        retrievedAt: retrievedAt(options),
        sourceRecordId: match.file.relativePath,
        evidenceIds: match.lineNumbers.map((line) => `${match.file.relativePath}:L${line}`),
        artifactPointer: `${match.file.relativePath}#L${firstLine}`,
        score: match.score,
        metadata: {
          sizeBytes: match.file.size,
          matchedTokens: match.matchedTokens,
          lineNumbers: match.lineNumbers,
        },
      },
    ],
    metadata: {
      path: match.file.relativePath,
      sizeBytes: match.file.size,
      matchedTokens: match.matchedTokens,
      lineNumbers: match.lineNumbers,
    },
  };
}

function normalizedExtensions(
  extensions: readonly string[] | undefined,
): Set<string> | undefined {
  if (!extensions?.length) return undefined;
  return new Set(
    extensions
      .map((extension) => extension.trim().toLowerCase())
      .filter(Boolean)
      .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`)),
  );
}

function tokenize(value: string): string[] {
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  return [...new Set(tokens)];
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  let control = 0;
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13) continue;
    if (byte < 32 || byte === 127) control += 1;
  }
  return sample.length === 0 || control / sample.length <= 0.02;
}

function workspaceRelativePath(workspaceRoot: string, absolutePath: string): string {
  return relative(workspaceRoot, absolutePath).split(sep).join("/");
}

function encodeWorkspacePath(relativePath: string): string {
  return relativePath.split("/").map(encodeURIComponent).join("/");
}

function evidenceLimit(
  request: ResearchSourceRequest,
  options: FileSourceAdapterOptions,
): number {
  return Math.max(
    1,
    Math.min(
      request.limits.maxBreadth,
      positiveInteger(options.maxEvidence, DEFAULT_MAX_EVIDENCE),
    ),
  );
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

function retrievedAt(options: FileSourceAdapterOptions): string {
  if (typeof options.retrievedAt === "function") return options.retrievedAt();
  return options.retrievedAt ?? new Date().toISOString();
}
