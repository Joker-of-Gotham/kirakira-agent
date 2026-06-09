import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { findRepoRoot } from "../util/repo-root.js";

export interface RuntimeScriptInvocation {
  command: string;
  args: string[];
  cwd: string;
}

export interface RuntimeScriptInvocationOptions {
  scriptName: string;
  args?: string[];
}

export function resolveKirakiraRepoRoot(env: NodeJS.ProcessEnv = process.env): string {
  const repoRoot = env.KIRAKIRA_REPO_ROOT ?? findRepoRoot();
  if (!existsSync(join(repoRoot, "pnpm-workspace.yaml"))) {
    throw new Error(`Could not locate Kirakira repo root containing pnpm-workspace.yaml: ${repoRoot}`);
  }
  return repoRoot;
}

export function buildRuntimeScriptInvocation(
  options: RuntimeScriptInvocationOptions,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeScriptInvocation {
  const repoRoot = resolveKirakiraRepoRoot(env);
  const scriptPath = join(repoRoot, "scripts", options.scriptName);
  if (!existsSync(scriptPath)) {
    throw new Error(`Runtime script not found: ${scriptPath}`);
  }
  return {
    command: process.execPath,
    args: [scriptPath, ...(options.args ?? [])],
    cwd: repoRoot,
  };
}

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return signal ? 1 : 0;
}

export function runRuntimeScriptInvocation(
  invocation: RuntimeScriptInvocation,
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: { ...env },
      stdio: "inherit",
      shell: false,
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (typeof code === "number") {
        resolve(code);
        return;
      }
      resolve(exitCodeForSignal(signal));
    });
  });
}
