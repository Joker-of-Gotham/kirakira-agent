import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

const runLive = process.env.KIRAKIRA_LIVE_E2E === "1";

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function runCommand(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, KIRAKIRA_LIVE_E2E: "1" },
      shell: process.platform === "win32",
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      output += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output });
    });
  });
}

describe.skipIf(!runLive)("workbench-host live smoke", () => {
  it("starts the profile-defined web surface until readiness passes", async () => {
    const timeoutMs = Number(process.env.KIRAKIRA_WORKBENCH_E2E_TIMEOUT_MS ?? 180_000);
    const result = await runCommand(
      pnpmCommand(),
      [
        "e2e:workbench",
        "--",
        "--profile",
        "workbench-host",
        "--surface",
        "web",
        "--timeout-ms",
        String(Math.max(1, timeoutMs - 30_000)),
        "--live",
      ],
      timeoutMs,
    );

    expect(result.output).not.toContain("5173");
    expect(result.signal).toBeNull();
    expect(result.code).toBe(0);
  });
});
