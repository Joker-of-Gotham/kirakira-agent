import {
  buildRuntimeScriptInvocation,
  type RuntimeScriptInvocation,
} from "./runtime-script-command.js";

export interface RuntimeDoctorCliOptions {
  profile?: string;
  json?: boolean;
  noProbe?: boolean;
  planOnly?: boolean;
  timeoutMs?: number;
}

export type RuntimeDoctorScriptInvocation = RuntimeScriptInvocation;

export function buildRuntimeDoctorScriptInvocation(
  options: RuntimeDoctorCliOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeDoctorScriptInvocation {
  const args = [];
  if (options.profile) args.push(options.profile);
  if (options.json) args.push("--json");
  if (options.noProbe) args.push("--no-probe");
  if (options.planOnly) args.push("--plan-only");
  if (options.timeoutMs !== undefined) {
    args.push("--timeout-ms", String(options.timeoutMs));
  }
  return buildRuntimeScriptInvocation({
    scriptName: "runtime-doctor.mjs",
    args,
  }, env);
}
