import { describe, expect, it } from "vitest";

import { serializeRuntimeScriptArgs } from "../../../packages/cli/src/runtime/runtime-script-registry.js";

describe("runtime script registry", () => {
  it("serializes runtime profile arguments from declarative descriptors", () => {
    expect(serializeRuntimeScriptArgs("profile", {})).toEqual(["show"]);
    expect(serializeRuntimeScriptArgs("profile", {
      action: "env",
      profile: "workbench-host",
    })).toEqual(["env", "workbench-host"]);
  });

  it("serializes runtime ready flags without routing through doctor", () => {
    expect(serializeRuntimeScriptArgs("ready", {
      profile: "workbench-host",
      json: true,
      noProbe: true,
      planOnly: true,
    })).toEqual(["workbench-host", "--json", "--no-probe", "--plan-only"]);
  });

  it("serializes runtime doctor flags and value options in CLI order", () => {
    expect(serializeRuntimeScriptArgs("doctor", {
      profile: "workbench-host",
      json: true,
      noProbe: true,
      planOnly: true,
      timeoutMs: 2500,
    })).toEqual([
      "workbench-host",
      "--json",
      "--no-probe",
      "--plan-only",
      "--timeout-ms",
      "2500",
    ]);
  });
});
