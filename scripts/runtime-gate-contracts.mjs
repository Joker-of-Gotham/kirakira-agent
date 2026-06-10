export function runtimeGateEntryEnv(entry) {
  if (!isRecord(entry?.env)) return {};
  return Object.fromEntries(
    Object.entries(entry.env).filter(([, value]) => typeof value === "string"),
  );
}

export function runtimeGateStepExecutionStatus(command) {
  const evidence = isRecord(command?.evidence) ? command.evidence : {};
  if (evidence.resultStatus !== undefined && evidence.resultMatches === false) {
    return "mismatch";
  }
  if (command?.status === "passed") return "passed";
  return command?.live ? "pending" : "skipped";
}

export function runtimeGateStepIdentity(step) {
  return {
    id: stringValue(step?.id) ?? "unknown",
    kind: stringValue(step?.kind) ?? "unknown",
    profile: stringValue(step?.profile) ?? "unknown",
    gate: stringValue(step?.gate) ?? "unknown",
    checks: stringArray(step?.checks),
  };
}

export function runtimeGateIdentity(input) {
  return {
    gate: stringValue(input?.gate) ?? "unknown",
    ...(input?.profile !== undefined ? { profile: stringValue(input.profile) ?? "unknown" } : {}),
    ...(input?.integrationGate !== undefined
      ? { integrationGate: stringValue(input.integrationGate) ?? "unknown" }
      : {}),
    ...(input?.checks !== undefined ? { checks: stringArray(input.checks) } : {}),
    ...(input?.lifecycleSteps !== undefined
      ? { lifecycleSteps: stringArray(input.lifecycleSteps) }
      : {}),
    steps: Array.isArray(input?.steps) ? input.steps.map(runtimeGateStepIdentity) : [],
  };
}

export function runtimeGateResultMatches(result, expected) {
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
  if (!Array.isArray(result.steps) || result.steps.length !== expected.steps.length) {
    return false;
  }
  return expected.steps.every((step, index) => runtimeGateStepMatches(result.steps[index], step));
}

export function runtimeGateStepMatches(actual, expected) {
  return (
    isRecord(actual) &&
    actual.id === expected.id &&
    actual.kind === expected.kind &&
    actual.profile === expected.profile &&
    actual.gate === expected.gate &&
    sameStringArray(actual.checks, expected.checks)
  );
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function stringValue(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
