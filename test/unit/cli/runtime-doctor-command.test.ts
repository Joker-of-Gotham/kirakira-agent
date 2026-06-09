import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRuntimeDoctorScriptInvocation } from "../../../packages/cli/src/runtime/runtime-doctor-command.js";

describe("runtime doctor CLI invocation", () => {
  it("maps CLI profile and flags to the shared runtime doctor script", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-doctor-"));
    mkdirSync(join(repoRoot, "scripts"));
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
    writeFileSync(join(repoRoot, "scripts", "runtime-doctor.mjs"), "", "utf8");

    const invocation = buildRuntimeDoctorScriptInvocation(
      {
        profile: "workbench-host",
        json: true,
        noProbe: true,
        timeoutMs: 2500,
      },
      { KIRAKIRA_REPO_ROOT: repoRoot },
    );

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.cwd).toBe(repoRoot);
    expect(invocation.args).toEqual([
      join(repoRoot, "scripts", "runtime-doctor.mjs"),
      "workbench-host",
      "--json",
      "--no-probe",
      "--timeout-ms",
      "2500",
    ]);
    expect(invocation.args.join(" ")).not.toContain("5173");
  });

  it("fails clearly when the shared runtime doctor script cannot be found", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-doctor-missing-"));
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");

    expect(() =>
      buildRuntimeDoctorScriptInvocation({}, { KIRAKIRA_REPO_ROOT: repoRoot }),
    ).toThrow(/Runtime script not found/u);
  });

  it("fails clearly when the repo root marker cannot be found", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-doctor-outside-"));

    expect(() =>
      buildRuntimeDoctorScriptInvocation({}, { KIRAKIRA_REPO_ROOT: repoRoot }),
    ).toThrow(/Could not locate Kirakira repo root/u);
  });
});
