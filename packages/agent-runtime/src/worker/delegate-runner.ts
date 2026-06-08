import type {
  DelegateRunner,
  RuntimeDeps,
} from "../loop/react-loop.js";
import type { SubagentRuntimePolicy } from "../types.js";

import { EphemeralWorker } from "./ephemeral-worker.js";

export interface EphemeralDelegateRunnerOptions {
  policy?: SubagentRuntimePolicy;
  allowNestedDelegation?: boolean;
}

export function createEphemeralDelegateRunner(
  deps: RuntimeDeps,
  options: EphemeralDelegateRunnerOptions = {},
): DelegateRunner {
  return async (request) => {
    const worker = new EphemeralWorker(request.parentConfig, options.policy);
    const childDeps = options.allowNestedDelegation
      ? deps
      : { ...deps, delegateRunner: undefined };
    const result = await worker.run(request.task, childDeps, {
      policy: options.policy,
    });
    if (result.error) {
      return {
        success: false,
        workerId: result.workerId,
        error: result.error,
      };
    }
    return {
      success: true,
      workerId: result.workerId,
      finalText: result.finalText ?? "",
    };
  };
}
