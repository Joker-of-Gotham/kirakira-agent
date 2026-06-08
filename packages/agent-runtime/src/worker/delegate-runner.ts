import type {
  DelegateRequest,
  DelegateRunner,
  RuntimeDeps,
} from "../loop/react-loop.js";
import {
  applyRuntimeCapabilityScope,
  runtimeCapabilityScopeFromCapabilities,
} from "../runtime-scope.js";
import type { RuntimeCapabilityScope, SubagentRuntimePolicy } from "../types.js";

import { EphemeralWorker } from "./ephemeral-worker.js";

export interface EphemeralDelegateRunnerOptions {
  policy?: SubagentRuntimePolicy;
  allowNestedDelegation?: boolean;
  capabilityScope?: RuntimeCapabilityScope;
  forkDeps?: (
    deps: RuntimeDeps,
    scope: RuntimeCapabilityScope | undefined,
    request: DelegateRequest,
  ) => RuntimeDeps;
}

export function createEphemeralDelegateRunner(
  deps: RuntimeDeps,
  options: EphemeralDelegateRunnerOptions = {},
): DelegateRunner {
  return async (request) => {
    const capabilityScope =
      request.capabilities !== undefined
        ? runtimeCapabilityScopeFromCapabilities(request.capabilities)
        : options.capabilityScope ?? {
            toolNames: [],
            skillNames: [],
            mcpServers: [],
          };
    const parentConfig = applyRuntimeCapabilityScope(
      {
        ...request.parentConfig,
        ...(request.modelPreference !== undefined ? { model: request.modelPreference } : {}),
      },
      capabilityScope,
    );
    const worker = new EphemeralWorker(parentConfig, options.policy);
    const baseChildDeps = options.allowNestedDelegation
      ? deps
      : { ...deps, delegateRunner: undefined };
    const childDeps = options.forkDeps
      ? options.forkDeps(baseChildDeps, capabilityScope, request)
      : baseChildDeps;
    const policy = request.runtimePolicy ?? options.policy;
    const result = await worker.run(request.task, childDeps, {
      policy,
      capabilityScope,
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
