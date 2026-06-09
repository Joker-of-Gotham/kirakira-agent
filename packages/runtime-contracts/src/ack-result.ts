import type { RuntimeArtifactContent } from "./artifact-content.js";
import type { RunStateSnapshot } from "./snapshot.js";

export interface RuntimeSubmitAckResult {
  runId: string;
}

export type RuntimeAckResultPayload =
  | RuntimeSubmitAckResult
  | RunStateSnapshot
  | RuntimeArtifactContent
  | undefined;

export type RuntimeAckResultParser<T> = (value: unknown) => T;

export class RuntimeAckResultError extends Error {
  constructor(
    readonly expected: string,
    readonly value: unknown,
  ) {
    super(`Runtime ack result is not a valid ${expected}`);
    this.name = "RuntimeAckResultError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringValue = (value: unknown): value is string => typeof value === "string";

const numberValue = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function isRuntimeSubmitAckResult(value: unknown): value is RuntimeSubmitAckResult {
  return isRecord(value) && stringValue(value.runId);
}

export function isRuntimeArtifactContent(value: unknown): value is RuntimeArtifactContent {
  if (!isRecord(value)) return false;
  return (
    stringValue(value.runId) &&
    stringValue(value.artifactId) &&
    stringValue(value.path) &&
    numberValue(value.sizeBytes) &&
    typeof value.truncated === "boolean" &&
    (value.encoding === "utf8" || value.encoding === "base64") &&
    stringValue(value.content)
  );
}

export function isRunStateSnapshot(value: unknown): value is RunStateSnapshot {
  if (!isRecord(value)) return false;
  const costSummary = value.costSummary;
  return (
    stringValue(value.runId) &&
    stringValue(value.status) &&
    Array.isArray(value.activeWorkers) &&
    Array.isArray(value.pendingApprovals) &&
    isRecord(costSummary) &&
    numberValue(costSummary.totalCostUsd) &&
    numberValue(costSummary.totalTokens)
  );
}

function parseAckResult<T>(
  value: unknown,
  expected: string,
  guard: (value: unknown) => value is T,
): T {
  if (guard(value)) return value;
  throw new RuntimeAckResultError(expected, value);
}

export function parseRuntimeSubmitAckResult(value: unknown): RuntimeSubmitAckResult {
  return parseAckResult(value, "submit result", isRuntimeSubmitAckResult);
}

export function parseRuntimeStateSnapshotAckResult(value: unknown): RunStateSnapshot {
  return parseAckResult(value, "state snapshot", isRunStateSnapshot);
}

export function parseRuntimeArtifactContentAckResult(value: unknown): RuntimeArtifactContent {
  return parseAckResult(value, "artifact content", isRuntimeArtifactContent);
}

export function parseRuntimeVoidAckResult(value: unknown): undefined {
  if (value === undefined) return undefined;
  throw new RuntimeAckResultError("empty ack", value);
}
