export const DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES = 64 * 1024;
export const RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES = 512 * 1024;

export type RuntimeArtifactContentEncoding = "utf8" | "base64";

export const RUNTIME_TEXT_ARTIFACT_KINDS = [
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
] as const;

export const RUNTIME_TEXT_ARTIFACT_EXTENSIONS = [
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
] as const;

export interface RuntimeArtifactContentRequest {
  runId: string;
  artifactId: string;
  maxBytes?: number;
}

export interface RuntimeArtifactContent {
  runId: string;
  artifactId: string;
  path: string;
  kind?: string;
  createdAt?: string;
  updatedAt?: string;
  sizeBytes: number;
  truncated: boolean;
  encoding: RuntimeArtifactContentEncoding;
  content: string;
}

const TEXT_ARTIFACT_KIND_SET = new Set<string>(RUNTIME_TEXT_ARTIFACT_KINDS);
const TEXT_ARTIFACT_EXTENSION_SET = new Set<string>(RUNTIME_TEXT_ARTIFACT_EXTENSIONS);

export function normalizeRuntimeArtifactContentMaxBytes(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 1 || value > RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES) return undefined;
  return value;
}

export function resolveRuntimeArtifactContentMaxBytes(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES;
  if (!Number.isInteger(value) || value < 1) {
    return DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES;
  }
  return Math.min(value, RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES);
}

function artifactExtension(value: string | undefined): string {
  if (!value) return "";
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? "";
  const slash = Math.max(withoutQuery.lastIndexOf("/"), withoutQuery.lastIndexOf("\\"));
  const basename = withoutQuery.slice(slash + 1);
  const dot = basename.lastIndexOf(".");
  if (dot <= 0) return "";
  return basename.slice(dot).toLowerCase();
}

export function runtimeArtifactContentLooksTextual(input: {
  kind?: string;
  path?: string;
  bytes?: Uint8Array;
}): boolean {
  const kind = input.kind?.toLowerCase();
  if (kind && TEXT_ARTIFACT_KIND_SET.has(kind)) return true;
  if (TEXT_ARTIFACT_EXTENSION_SET.has(artifactExtension(input.path))) return true;
  return input.bytes !== undefined && !input.bytes.includes(0);
}

export function detectRuntimeArtifactContentEncoding(input: {
  kind?: string;
  path?: string;
  bytes: Uint8Array;
}): RuntimeArtifactContentEncoding {
  return runtimeArtifactContentLooksTextual(input) ? "utf8" : "base64";
}
