import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { findRepoRoot } from "../util/repo-root.js";
import {
  getRuntimeScriptDefinition,
  serializeRuntimeScriptArgs,
  type RuntimeScriptId,
  type RuntimeScriptOptionsById,
} from "./runtime-script-registry.js";

export interface RuntimeScriptInvocation {
  command: string;
  args: string[];
  cwd: string;
}

export interface RuntimeScriptInvocationOptions<TScriptId extends RuntimeScriptId = RuntimeScriptId> {
  scriptId: TScriptId;
  args?: string[];
  scriptOptions?: RuntimeScriptOptionsById[TScriptId];
}

export interface RuntimeScriptPathResolution {
  repoRoot: string;
  scriptPath: string;
}

export function resolveKirakiraRepoRoot(env: NodeJS.ProcessEnv = process.env): string {
  const repoRoot = env.KIRAKIRA_REPO_ROOT ?? findRepoRoot();
  if (!existsSync(join(repoRoot, "pnpm-workspace.yaml"))) {
    throw new Error(`Could not locate Kirakira repo root containing pnpm-workspace.yaml: ${repoRoot}`);
  }
  return repoRoot;
}

export function buildRuntimeScriptInvocation<TScriptId extends RuntimeScriptId>(
  options: RuntimeScriptInvocationOptions<TScriptId>,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeScriptInvocation {
  const { repoRoot, scriptPath } = resolveRuntimeScriptPath(options.scriptId, env);
  const args = options.args ?? serializeRuntimeScriptArgs(options.scriptId, options.scriptOptions ?? {});
  return {
    command: process.execPath,
    args: [scriptPath, ...args],
    cwd: repoRoot,
  };
}

export function resolveRuntimeScriptPath(
  scriptId: RuntimeScriptId,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeScriptPathResolution {
  const repoRoot = resolveKirakiraRepoRoot(env);
  const scriptPath = join(repoRoot, "scripts", getRuntimeScriptDefinition(scriptId).scriptName);
  if (!existsSync(scriptPath)) {
    throw new Error(`Runtime script not found: ${scriptPath}`);
  }
  return {
    repoRoot,
    scriptPath,
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
