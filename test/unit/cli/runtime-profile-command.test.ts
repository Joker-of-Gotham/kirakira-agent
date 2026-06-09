import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRuntimeProfileScriptInvocation } from "../../../packages/cli/src/runtime/runtime-profile-command.js";

function fakeRepo(scriptName = "runtime-profile.mjs"): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-profile-"));
  mkdirSync(join(repoRoot, "scripts"));
  writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
  writeFileSync(join(repoRoot, "scripts", scriptName), "", "utf8");
  return repoRoot;
}

describe("runtime profile CLI invocation", () => {
  it("maps profile action and profile name to the shared runtime profile script", () => {
    const repoRoot = fakeRepo();

    const invocation = buildRuntimeProfileScriptInvocation(
      {
        action: "env",
        profile: "workbench-host",
      },
      { KIRAKIRA_REPO_ROOT: repoRoot },
    );

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.cwd).toBe(repoRoot);
    expect(invocation.args).toEqual([
      join(repoRoot, "scripts", "runtime-profile.mjs"),
      "env",
      "workbench-host",
    ]);
    expect(invocation.args.join(" ")).not.toContain("5173");
  });

  it("defaults to the show action without hardcoding a profile name", () => {
    const repoRoot = fakeRepo();

    const invocation = buildRuntimeProfileScriptInvocation(
      {},
      { KIRAKIRA_REPO_ROOT: repoRoot },
    );

    expect(invocation.args).toEqual([
      join(repoRoot, "scripts", "runtime-profile.mjs"),
      "show",
    ]);
  });

  it("fails clearly when the runtime profile script cannot be found", () => {
    const repoRoot = fakeRepo("runtime-doctor.mjs");

    expect(() =>
      buildRuntimeProfileScriptInvocation({}, { KIRAKIRA_REPO_ROOT: repoRoot }),
    ).toThrow(/Runtime script not found/u);
  });
});
