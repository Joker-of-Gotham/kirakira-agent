import {
  buildRuntimeScriptInvocation,
  type RuntimeScriptInvocation,
} from "./runtime-script-command.js";
import type { RuntimeProfileScriptOptions } from "./runtime-script-registry.js";

export type RuntimeProfileCliOptions = RuntimeProfileScriptOptions;

export type RuntimeProfileScriptInvocation = RuntimeScriptInvocation;

export function buildRuntimeProfileScriptInvocation(
  options: RuntimeProfileCliOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeProfileScriptInvocation {
  return buildRuntimeScriptInvocation({
    scriptId: "profile",
    scriptOptions: options,
  }, env);
}
