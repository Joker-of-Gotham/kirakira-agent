import {
  buildRuntimeScriptInvocation,
  type RuntimeScriptInvocation,
} from "./runtime-script-command.js";
import type { RuntimeDoctorScriptOptions } from "./runtime-script-registry.js";

export type RuntimeDoctorCliOptions = RuntimeDoctorScriptOptions;

export type RuntimeDoctorScriptInvocation = RuntimeScriptInvocation;

export function buildRuntimeDoctorScriptInvocation(
  options: RuntimeDoctorCliOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): RuntimeDoctorScriptInvocation {
  return buildRuntimeScriptInvocation({
    scriptId: "doctor",
    scriptOptions: options,
  }, env);
}
