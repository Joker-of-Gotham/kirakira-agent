import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRepoRoot } from "../../helpers/repo-root.js";

const root = getRepoRoot(import.meta.url);
const cliRun = path.join(root, "packages/cli/bin/run.js");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliRun, ...args], {
    cwd: root,
    env: {
      ...process.env,
      KIRAKIRA_REPO_ROOT: root,
    },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
}

describe("runtime profile CLI command contract", () => {
  it("defaults to the show action when only --profile is provided", () => {
    const result = runCli(["runtime", "profile", "--profile", "workbench-host"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");

    const profile = JSON.parse(result.stdout) as { name: string };
    expect(profile.name).toBe("workbench-host");
  });

  it("prints runtime env through the built oclif command tree", () => {
    const result = runCli(["runtime", "profile", "env", "workbench-host"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");
    expect(result.stdout).toContain("KIRAKIRA_WEB_URL=http://127.0.0.1:5183");
    expect(result.stdout).toContain("KIRAKIRA_DESKTOP_RENDERER_URL=http://127.0.0.1:5174");
    expect(result.stdout).toContain("VITE_KIRAKIRA_GATEWAY_URL=ws://127.0.0.1:17373/runtime");
  });

  it("prints readiness JSON without changing the runtime profile logic", () => {
    const result = runCli(["runtime", "profile", "readiness", "--profile", "workbench-host"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");

    const plan = JSON.parse(result.stdout) as {
      profile: string;
      checks: Array<{ target?: string }>;
    };
    expect(plan.profile).toBe("workbench-host");
    expect(plan.checks.map((check) => check.target)).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:17373/healthz",
        "http://127.0.0.1:5183/",
        "http://127.0.0.1:5174/",
      ]),
    );
  });

  it("returns the shared profile failure for unknown runtime profiles", () => {
    const result = runCli(["runtime", "profile", "show", "definitely-missing-profile"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown runtime profile");
  });
});
