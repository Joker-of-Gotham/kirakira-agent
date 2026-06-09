import { open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import type { RunState } from "@kirakira/runtime-contracts";
import {
  DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES,
  RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES,
  type ArtifactRecord,
  type RuntimeArtifactContent,
} from "@kirakira/runtime-contracts";

export class RuntimeArtifactContentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "RuntimeArtifactContentError";
  }
}

export interface ReadRuntimeArtifactContentOptions {
  state: RunState;
  artifactId: string;
  fallbackWorkspaceRoot: string;
  maxBytes?: number;
}

const TEXT_ARTIFACT_KINDS = new Set([
  "diff",
  "json",
  "log",
  "markdown",
  "md",
  "patch",
  "text",
  "txt",
  "yaml",
  "yml",
]);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".diff",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".log",
  ".md",
  ".patch",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

function normalizeMaxBytes(maxBytes: number | undefined): number {
  if (maxBytes === undefined) return DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES;
  return Math.min(maxBytes, RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES);
}

function assertInsideWorkspace(root: string, target: string): void {
  const relative = path.relative(root, target);
  if (relative === "") return;
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new RuntimeArtifactContentError(
      "artifact_outside_workspace",
      "Artifact path resolves outside the workspace root",
      { root, target },
    );
  }
}

async function resolveArtifactPath(
  workspaceRoot: string,
  artifactPath: string,
): Promise<string> {
  const root = await realpath(path.resolve(workspaceRoot));
  const candidate = path.isAbsolute(artifactPath)
    ? path.normalize(artifactPath)
    : path.resolve(root, artifactPath);
  const target = await realpath(candidate);
  assertInsideWorkspace(root, target);
  return target;
}

function looksTextual(record: ArtifactRecord, filePath: string, bytes: Buffer): boolean {
  const kind = record.kind?.toLowerCase();
  if (kind && TEXT_ARTIFACT_KINDS.has(kind)) return true;
  if (TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;
  return !bytes.includes(0);
}

async function readPrefix(filePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes + 1);
    const result = await handle.read(buffer, 0, maxBytes + 1, 0);
    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

export async function readRuntimeArtifactContent(
  options: ReadRuntimeArtifactContentOptions,
): Promise<RuntimeArtifactContent> {
  const record = options.state.artifacts[options.artifactId];
  if (!record) {
    throw new RuntimeArtifactContentError(
      "unknown_artifact",
      `Artifact not found: ${options.artifactId}`,
    );
  }
  if (!record.path) {
    throw new RuntimeArtifactContentError(
      "artifact_path_missing",
      `Artifact does not expose a path: ${options.artifactId}`,
    );
  }

  const workspaceRoot = options.state.workspaceRoot ?? options.fallbackWorkspaceRoot;
  const maxBytes = normalizeMaxBytes(options.maxBytes);
  let filePath: string;
  try {
    filePath = await resolveArtifactPath(workspaceRoot, record.path);
  } catch (error) {
    if (error instanceof RuntimeArtifactContentError) throw error;
    throw new RuntimeArtifactContentError(
      "artifact_unreadable",
      `Artifact path is not readable: ${options.artifactId}`,
      error instanceof Error ? error.message : String(error),
    );
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new RuntimeArtifactContentError(
      "artifact_not_file",
      `Artifact path is not a file: ${options.artifactId}`,
    );
  }

  const bytes = await readPrefix(filePath, maxBytes);
  const truncated = bytes.length > maxBytes;
  const previewBytes = truncated ? bytes.subarray(0, maxBytes) : bytes;
  const text = looksTextual(record, filePath, previewBytes);
  return {
    runId: options.state.runId,
    artifactId: record.id,
    path: record.path,
    ...(record.kind !== undefined ? { kind: record.kind } : {}),
    ...(record.createdAt !== undefined ? { createdAt: record.createdAt } : {}),
    ...(record.updatedAt !== undefined ? { updatedAt: record.updatedAt } : {}),
    sizeBytes: fileStat.size,
    truncated,
    encoding: text ? "utf8" : "base64",
    content: text ? previewBytes.toString("utf8") : previewBytes.toString("base64"),
  };
}
