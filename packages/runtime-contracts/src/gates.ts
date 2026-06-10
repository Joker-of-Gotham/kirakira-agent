export interface RuntimeGateStepIdentity {
  id: string;
  kind: string;
  profile: string;
  gate: string;
  checks: string[];
}

export interface RuntimeGateIdentity {
  gate: string;
  profile?: string;
  integrationGate?: string;
  checks?: string[];
  lifecycleSteps?: string[];
  steps: RuntimeGateStepIdentity[];
}

export interface RuntimeGateEvidenceLike {
  resultStatus?: unknown;
  resultMatches?: unknown;
}

export interface RuntimeGateCommandLike {
  status?: unknown;
  live?: unknown;
  evidence?: RuntimeGateEvidenceLike;
}

export function runtimeGateEntryEnv(entry: unknown): Record<string, string> {
  if (!isRecord(entry) || !isRecord(entry.env)) return {};
  return Object.fromEntries(
    Object.entries(entry.env).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string",
    ),
  );
}

export function runtimeGateStepExecutionStatus(
  command: RuntimeGateCommandLike,
): "mismatch" | "passed" | "pending" | "skipped" {
  const evidence = isRecord(command.evidence) ? command.evidence : {};
  if (evidence.resultStatus !== undefined && evidence.resultMatches === false) {
    return "mismatch";
  }
  if (command.status === "passed") return "passed";
  return command.live ? "pending" : "skipped";
}

export function runtimeGateStepIdentity(step: unknown): RuntimeGateStepIdentity {
  const record = isRecord(step) ? step : {};
  return {
    id: stringValue(record.id) ?? "unknown",
    kind: stringValue(record.kind) ?? "unknown",
    profile: stringValue(record.profile) ?? "unknown",
    gate: stringValue(record.gate) ?? "unknown",
    checks: stringArray(record.checks),
  };
}

export function runtimeGateIdentity(input: unknown): RuntimeGateIdentity {
  const record = isRecord(input) ? input : {};
  return {
    gate: stringValue(record.gate) ?? "unknown",
    ...(record.profile !== undefined ? { profile: stringValue(record.profile) ?? "unknown" } : {}),
    ...(record.integrationGate !== undefined
      ? { integrationGate: stringValue(record.integrationGate) ?? "unknown" }
      : {}),
    ...(record.checks !== undefined ? { checks: stringArray(record.checks) } : {}),
    ...(record.lifecycleSteps !== undefined
      ? { lifecycleSteps: stringArray(record.lifecycleSteps) }
      : {}),
    steps: Array.isArray(record.steps) ? record.steps.map(runtimeGateStepIdentity) : [],
  };
}

export function runtimeGateResultMatches(result: unknown, expected: RuntimeGateIdentity): boolean {
  if (!isRecord(result) || result.schemaVersion !== 1 || result.status !== "passed") {
    return false;
  }
  if (result.gate !== expected.gate) return false;
  if (expected.profile !== undefined && result.profile !== expected.profile) return false;
  if (
    expected.integrationGate !== undefined &&
    result.integrationGate !== expected.integrationGate
  ) {
    return false;
  }
  if (expected.checks !== undefined && !sameStringArray(result.checks, expected.checks)) {
    return false;
  }
  if (
    expected.lifecycleSteps !== undefined &&
    !sameStringArray(result.lifecycleSteps, expected.lifecycleSteps)
  ) {
    return false;
  }
  const resultSteps = result.steps;
  if (!Array.isArray(resultSteps) || resultSteps.length !== expected.steps.length) {
    return false;
  }
  return expected.steps.every((step, index) => runtimeGateStepMatches(resultSteps[index], step));
}

export function runtimeGateStepMatches(
  actual: unknown,
  expected: RuntimeGateStepIdentity,
): boolean {
  return (
    isRecord(actual) &&
    actual.id === expected.id &&
    actual.kind === expected.kind &&
    actual.profile === expected.profile &&
    actual.gate === expected.gate &&
    sameStringArray(actual.checks, expected.checks)
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sameStringArray(left: unknown, right: unknown): boolean {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
