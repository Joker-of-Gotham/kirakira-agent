import {
  buildRuntimeScriptInvocation,
  type RuntimeScriptInvocation,
} from "./runtime-script-command.js";

export interface RuntimeReadyCliOptions {
  profile?: string;
  json?: boolean;
  noProbe?: boolean;
  planOnly?: boolean;
}

export type RuntimeReadyScriptInvocation = RuntimeScriptInvocation;

export function buildRuntimeReadyScriptInvocation(
  options: RuntimeReadyCliOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeReadyScriptInvocation {
  const args = [];
  if (options.profile) args.push(options.profile);
  if (options.json) args.push("--json");
  if (options.noProbe) args.push("--no-probe");
  if (options.planOnly) args.push("--plan-only");
  return buildRuntimeScriptInvocation({
    scriptId: "ready",
    args,
  }, env);
}
