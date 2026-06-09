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

describe("runtime doctor CLI command contract", () => {
  it("discovers runtime doctor through the built oclif command tree", () => {
    const result = runCli(["runtime", "doctor", "workbench-host", "--json", "--no-probe"]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain("5173");

    const report = JSON.parse(result.stdout) as {
      profile: string;
      summary: { skipped: number; total: number };
      checks: Array<{ target?: string; status: string }>;
    };
    expect(report.profile).toBe("workbench-host");
    expect(report.summary.skipped).toBe(report.summary.total);
    expect(report.checks.map((check) => check.target)).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:17373/healthz",
        "http://127.0.0.1:5183/",
        "http://127.0.0.1:5174/",
      ]),
    );
  });

  it("maps profile and plan-only flags to the shared doctor script", () => {
    const result = runCli([
      "runtime",
      "doctor",
      "--profile",
      "workbench-host",
      "--json",
      "--plan-only",
      "--timeout-ms",
      "2500",
    ]);

    expect(result.status).toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("5173");

    const report = JSON.parse(result.stdout) as {
      profile: string;
      checks: Array<{ status: string }>;
    };
    expect(report.profile).toBe("workbench-host");
    expect(report.checks.every((check) => check.status === "skipped")).toBe(true);
  });

  it("returns the shared doctor failure for unknown runtime profiles", () => {
    const result = runCli([
      "runtime",
      "doctor",
      "definitely-missing-profile",
      "--json",
      "--no-probe",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unknown runtime profile");
  });
});
