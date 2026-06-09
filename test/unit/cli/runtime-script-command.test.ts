import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRuntimeScriptInvocation,
  resolveKirakiraRepoRoot,
  runRuntimeScriptInvocation,
  type RuntimeScriptInvocation,
} from "../../../packages/cli/src/runtime/runtime-script-command.js";
import {
  getRuntimeScriptDefinition,
  runtimeScriptRegistry,
} from "../../../packages/cli/src/runtime/runtime-script-registry.js";

describe("runtime script command bridge", () => {
  it("keeps shared runtime scripts behind a typed registry", () => {
    expect(getRuntimeScriptDefinition("profile").scriptName).toBe("runtime-profile.mjs");
    expect(getRuntimeScriptDefinition("ready").scriptName).toBe("runtime-ready.mjs");
    expect(getRuntimeScriptDefinition("doctor").scriptName).toBe("runtime-doctor.mjs");
    expect(JSON.stringify(runtimeScriptRegistry)).not.toContain("5173");
  });

  it("uses process.execPath and argv tokens instead of shell command strings", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "kirakira runtime bridge "));
    mkdirSync(join(repoRoot, "scripts"));
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
    writeFileSync(join(repoRoot, "scripts", "runtime-profile.mjs"), "", "utf8");

    const invocation = buildRuntimeScriptInvocation(
      {
        scriptId: "profile",
        args: ["show", "foo & echo bad"],
      },
      { KIRAKIRA_REPO_ROOT: repoRoot },
    );

    expect(invocation.command).toBe(process.execPath);
    expect(invocation.cwd).toBe(repoRoot);
    expect(invocation.args).toEqual([
      join(repoRoot, "scripts", "runtime-profile.mjs"),
      "show",
      "foo & echo bad",
    ]);
  });

  it("reports a missing repo marker before checking script paths", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-bridge-outside-"));

    expect(() => resolveKirakiraRepoRoot({ KIRAKIRA_REPO_ROOT: repoRoot })).toThrow(
      /Could not locate Kirakira repo root/u,
    );
  });

  it("reports missing scripts from a valid repo root", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-bridge-missing-script-"));
    mkdirSync(join(repoRoot, "scripts"));
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");

    expect(() =>
      buildRuntimeScriptInvocation(
        {
          scriptId: "profile",
        },
        { KIRAKIRA_REPO_ROOT: repoRoot },
      ),
    ).toThrow(/Runtime script not found/u);
  });

  it("returns the child process exit code", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "kirakira-runtime-bridge-exit-"));
    mkdirSync(join(repoRoot, "scripts"));
    writeFileSync(join(repoRoot, "pnpm-workspace.yaml"), "packages: []\n", "utf8");
    writeFileSync(join(repoRoot, "scripts", "exit-code.mjs"), "process.exit(7);\n", "utf8");

    const invocation: RuntimeScriptInvocation = {
      command: process.execPath,
      args: [join(repoRoot, "scripts", "exit-code.mjs")],
      cwd: repoRoot,
    };

    await expect(runRuntimeScriptInvocation(invocation)).resolves.toBe(7);
  });
});
