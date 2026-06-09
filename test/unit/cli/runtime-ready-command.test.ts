import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildRuntimeReadyScriptInvocation } from "../../../packages/cli/src/runtime/runtime-ready-command.js";

function fakeRepo(scriptName = "runtime-ready.mjs"): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-ready-"));
  mkdirSync(join(repoRoot, "scripts"));
  writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  writeFileSync(join(repoRoot, "scripts", scriptName), "", "utf8");
  return repoRoot;
}

describe("runtime ready CLI invocation", () => {
  it("maps profile and JSON flags to the plan-only runtime ready script", () => {
    const repoRoot = fakeRepo();

    const invocation = buildRuntimeReadyScriptInvocation(
      {
        profile: "workbench-host",
        json: true,
      },
      { KIRAKIRA_REPO_ROOT: repoRoot },
    );

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.cwd).toBe(repoRoot);
    expect(invocation.args).toEqual([
      join(repoRoot, "scripts", "runtime-ready.mjs"),
      "workbench-host",
      "--json",
    ]);
    expect(invocation.args.join(" ")).not.toContain("5173");
  });

  it("accepts no-probe flags without routing through runtime doctor", () => {
    const repoRoot = fakeRepo();

    const invocation = buildRuntimeReadyScriptInvocation(
      {
        noProbe: true,
        planOnly: true,
      },
      { KIRAKIRA_REPO_ROOT: repoRoot },
    );

    expect(invocation.args).toEqual([
      join(repoRoot, "scripts", "runtime-ready.mjs"),
      "--no-probe",
      "--plan-only",
    ]);
  });

  it("fails clearly when the runtime ready script cannot be found", () => {
    const repoRoot = fakeRepo("runtime-doctor.mjs");

    expect(() =>
      buildRuntimeReadyScriptInvocation({}, { KIRAKIRA_REPO_ROOT: repoRoot }),
    ).toThrow(/Runtime script not found/u);
  });
});
