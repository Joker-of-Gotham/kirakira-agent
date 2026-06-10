import {
  buildRuntimeScriptInvocation,
  type RuntimeScriptInvocation,
} from "./runtime-script-command.js";
import type { RuntimeReadyScriptOptions } from "./runtime-script-registry.js";

export type RuntimeReadyCliOptions = RuntimeReadyScriptOptions;

export type RuntimeReadyScriptInvocation = RuntimeScriptInvocation;

export function buildRuntimeReadyScriptInvocation(
  options: RuntimeReadyCliOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeReadyScriptInvocation {
  return buildRuntimeScriptInvocation({
    scriptId: "ready",
    scriptOptions: options,
  }, env);
}
