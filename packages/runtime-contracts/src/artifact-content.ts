export const DEFAULT_RUNTIME_ARTIFACT_CONTENT_MAX_BYTES = 64 * 1024;
export const RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES = 512 * 1024;

export type RuntimeArtifactContentEncoding = "utf8" | "base64";

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

export function normalizeRuntimeArtifactContentMaxBytes(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < 1 || value > RUNTIME_ARTIFACT_CONTENT_HARD_MAX_BYTES) return undefined;
  return value;
}
