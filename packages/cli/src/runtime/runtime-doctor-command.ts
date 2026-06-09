import { existsSync } from "node:fs";
import { join } from "node:path";

import { findRepoRoot } from "../util/repo-root.js";

export interface RuntimeDoctorCliOptions {
  profile?: string;
  json?: boolean;
  noProbe?: boolean;
  planOnly?: boolean;
  timeoutMs?: number;
}

export interface RuntimeDoctorScriptInvocation {
  command: string;
  args: string[];
  cwd: string;
}

export function buildRuntimeDoctorScriptInvocation(
  options: RuntimeDoctorCliOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeDoctorScriptInvocation {
  const repoRoot = env.KIRAKIRA_REPO_ROOT ?? findRepoRoot();
  if (!existsSync(join(repoRoot, "pnpm-workspace.yaml"))) {
    throw new Error(`Could not locate Kirakira repo root containing pnpm-workspace.yaml: ${repoRoot}`);
  }
  const scriptPath = join(repoRoot, "scripts", "runtime-doctor.mjs");
  if (!existsSync(scriptPath)) {
    throw new Error(`Runtime doctor script not found: ${scriptPath}`);
  }
  const args = [scriptPath];
  if (options.profile) args.push(options.profile);
  if (options.json) args.push("--json");
  if (options.noProbe) args.push("--no-probe");
  if (options.planOnly) args.push("--plan-only");
  if (options.timeoutMs !== undefined) {
    args.push("--timeout-ms", String(options.timeoutMs));
  }
  return {
    command: process.execPath,
    args,
    cwd: repoRoot,
  };
}
