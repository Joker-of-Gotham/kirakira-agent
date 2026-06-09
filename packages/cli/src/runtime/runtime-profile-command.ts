import {
  buildRuntimeScriptInvocation,
  type RuntimeScriptInvocation,
} from "./runtime-script-command.js";

export interface RuntimeProfileCliOptions {
  action?: string;
  profile?: string;
}

export type RuntimeProfileScriptInvocation = RuntimeScriptInvocation;

export function buildRuntimeProfileScriptInvocation(
  options: RuntimeProfileCliOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeProfileScriptInvocation {
  const args = [options.action ?? "show"];
  if (options.profile) args.push(options.profile);
  return buildRuntimeScriptInvocation({
    scriptId: "profile",
    args,
  }, env);
}
