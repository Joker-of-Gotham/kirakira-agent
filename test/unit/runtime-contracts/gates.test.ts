import { describe, expect, it } from "vitest";
import {
  runtimeGateEntryEnv,
  runtimeGateIdentity,
  runtimeGateResultMatches,
  runtimeGateStepExecutionStatus,
  runtimeGateStepIdentity,
} from "../../../packages/runtime-contracts/src/index.js";
import {
  runtimeGateEntryEnv as scriptRuntimeGateEntryEnv,
  runtimeGateIdentity as scriptRuntimeGateIdentity,
  runtimeGateResultMatches as scriptRuntimeGateResultMatches,
  runtimeGateStepExecutionStatus as scriptRuntimeGateStepExecutionStatus,
  runtimeGateStepIdentity as scriptRuntimeGateStepIdentity,
} from "../../../scripts/runtime-gate-contracts.mjs";

const step = {
  id: "presentation:hydrated-visual-qa",
  kind: "presentation-hydrated-visual-qa",
  profile: "workbench-host",
  gate: "presentation-hydrated-visual-qa",
  checks: [
    "presentation:hydrated-web",
    "presentation:core-workbench-views",
  ],
};

describe("runtime gate identity contract", () => {
  it("normalizes child env and gate step identity", () => {
    expect(runtimeGateEntryEnv({
      env: {
        VITE_KIRAKIRA_RUNTIME_MODE: "mock",
        KIRAKIRA_SECRET: 42,
        EMPTY: "",
      },
    })).toEqual({
      VITE_KIRAKIRA_RUNTIME_MODE: "mock",
      EMPTY: "",
    });
    expect(runtimeGateStepIdentity(step)).toEqual(step);
    expect(runtimeGateStepIdentity({ ...step, checks: ["ok", 1, "done"] })).toMatchObject({
      checks: ["ok", "done"],
    });
  });

  it("matches integration and lifecycle evidence with the same identity shape", () => {
    const integrationIdentity = runtimeGateIdentity({
      gate: "upgrade",
      steps: [step],
    });
    expect(runtimeGateResultMatches({
      schemaVersion: 1,
      gate: "upgrade",
      status: "passed",
      steps: [step],
    }, integrationIdentity)).toBe(true);

    const lifecycleIdentity = runtimeGateIdentity({
      gate: "runtime-full-lifecycle",
      profile: "workbench-host",
      integrationGate: "full-lifecycle",
      checks: ["runtime-lifecycle:hydrated-visual-qa"],
      lifecycleSteps: ["presentation:hydrated-visual-qa"],
      steps: [step],
    });
    expect(runtimeGateResultMatches({
      schemaVersion: 1,
      gate: "runtime-full-lifecycle",
      profile: "workbench-host",
      integrationGate: "full-lifecycle",
      status: "passed",
      checks: ["runtime-lifecycle:hydrated-visual-qa"],
      lifecycleSteps: ["presentation:hydrated-visual-qa"],
      steps: [step],
    }, lifecycleIdentity)).toBe(true);
    expect(runtimeGateResultMatches({
      schemaVersion: 1,
      gate: "runtime-full-lifecycle",
      profile: "workbench-host",
      integrationGate: "full-lifecycle",
      status: "blocked",
      checks: ["runtime-lifecycle:hydrated-visual-qa"],
      lifecycleSteps: ["presentation:hydrated-visual-qa"],
      steps: [step],
    }, lifecycleIdentity)).toBe(false);
  });

  it("derives child step execution status from evidence before live state", () => {
    expect(runtimeGateStepExecutionStatus({
      status: "passed",
      live: false,
      evidence: { resultStatus: "passed", resultMatches: false },
    })).toBe("mismatch");
    expect(runtimeGateStepExecutionStatus({ status: "passed", live: false })).toBe("passed");
    expect(runtimeGateStepExecutionStatus({ status: "ready", live: true })).toBe("pending");
    expect(runtimeGateStepExecutionStatus({ status: "skipped", live: false })).toBe("skipped");
  });

  it("keeps the executable script shim aligned with the package contract", () => {
    const entry = {
      env: {
        VITE_KIRAKIRA_RUNTIME_MODE: "mock",
        ignored: false,
      },
    };
    const identityInput = {
      gate: "upgrade",
      steps: [step],
    };
    const result = {
      schemaVersion: 1,
      gate: "upgrade",
      status: "passed",
      steps: [step],
    };
    expect(scriptRuntimeGateEntryEnv(entry)).toEqual(runtimeGateEntryEnv(entry));
    expect(scriptRuntimeGateStepIdentity(step)).toEqual(runtimeGateStepIdentity(step));
    expect(scriptRuntimeGateStepExecutionStatus({ live: true })).toEqual(
      runtimeGateStepExecutionStatus({ live: true }),
    );
    expect(scriptRuntimeGateIdentity(identityInput)).toEqual(runtimeGateIdentity(identityInput));
    expect(scriptRuntimeGateResultMatches(result, scriptRuntimeGateIdentity(identityInput))).toBe(
      runtimeGateResultMatches(result, runtimeGateIdentity(identityInput)),
    );
  });
});
