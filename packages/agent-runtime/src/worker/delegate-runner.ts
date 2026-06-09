import type {
  DelegateRequest,
  DelegateRunner,
  RuntimeDeps,
} from "../loop/react-loop.js";
import {
  applyRuntimeCapabilityScope,
  runtimeCapabilityScopeFromCapabilities,
} from "../runtime-scope.js";
import type {
  RuntimeCapabilityScope,
  SubagentHandoffMetadata,
  SubagentLineageMetadata,
  SubagentRuntimePolicy,
  SubagentTopologyMetadata,
} from "../types.js";

import { EphemeralWorker } from "./ephemeral-worker.js";

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function handoffValue(value: unknown): SubagentHandoffMetadata | undefined {
  const raw = objectValue(value);
  if (!raw) return undefined;
  const id = stringValue(raw.id);
  const from = stringValue(raw.from);
  const to = stringValue(raw.to);
  if (!id || !from || !to) return undefined;
  return {
    id,
    from,
    to,
    ...(stringValue(raw.mode) !== undefined ? { mode: stringValue(raw.mode) } : {}),
    ...(stringValue(raw.inputFilter) !== undefined
      ? { inputFilter: stringValue(raw.inputFilter) }
      : {}),
    ...(typeof raw.approvalRequired === "boolean"
      ? { approvalRequired: raw.approvalRequired }
      : {}),
    ...(stringArrayValue(raw.conditions) !== undefined
      ? { conditions: stringArrayValue(raw.conditions) }
      : {}),
  };
}

function topologyValue(value: unknown, fallbackHandoffEdgeId?: unknown): SubagentTopologyMetadata | undefined {
  const raw = objectValue(value);
  const parentRole = stringValue(raw?.parentRole);
  const handoffEdgeId = stringValue(raw?.handoffEdgeId) ?? stringValue(fallbackHandoffEdgeId);
  const handoff = handoffValue(raw?.handoff);
  const out: SubagentTopologyMetadata = {
    ...(parentRole !== undefined ? { parentRole } : {}),
    ...(handoffEdgeId !== undefined ? { handoffEdgeId } : {}),
    ...(handoff !== undefined ? { handoff } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

function lineageValue(value: unknown): SubagentLineageMetadata | undefined {
  const raw = objectValue(value);
  if (!raw) return undefined;
  const rootLineageId = stringValue(raw.rootLineageId);
  const parentLineageId = stringValue(raw.parentLineageId);
  const lineageId = stringValue(raw.lineageId);
  if (!rootLineageId || !parentLineageId || !lineageId) return undefined;
  return { rootLineageId, parentLineageId, lineageId };
}

function effectiveDelegateRequest(request: DelegateRequest): DelegateRequest {
  const args = request.action.args ?? {};
  const permissions = request.permissions ?? stringArrayValue(args.permissions);
  const topology = request.topology ?? topologyValue(args.topology, args.handoffEdgeId);
  const lineage = request.lineage ?? lineageValue(args.lineage);
  return {
    ...request,
    ...(permissions !== undefined ? { permissions } : {}),
    ...(topology !== undefined ? { topology } : {}),
    ...(lineage !== undefined ? { lineage } : {}),
  };
}

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
    const effectiveRequest = effectiveDelegateRequest(request);
    const capabilityScope =
      effectiveRequest.capabilities !== undefined
        ? runtimeCapabilityScopeFromCapabilities(effectiveRequest.capabilities)
        : options.capabilityScope ?? {
            toolNames: [],
            skillNames: [],
            mcpServers: [],
          };
    const parentConfig = applyRuntimeCapabilityScope(
      {
        ...effectiveRequest.parentConfig,
        ...(effectiveRequest.modelPreference !== undefined
          ? { model: effectiveRequest.modelPreference }
          : {}),
        ...(effectiveRequest.permissions !== undefined
          ? { permissions: effectiveRequest.permissions }
          : {}),
        ...(effectiveRequest.topology !== undefined ? { topology: effectiveRequest.topology } : {}),
        ...(effectiveRequest.lineage !== undefined ? { lineage: effectiveRequest.lineage } : {}),
      },
      capabilityScope,
    );
    const worker = new EphemeralWorker(parentConfig, options.policy);
    const baseChildDeps = options.allowNestedDelegation
      ? deps
      : { ...deps, delegateRunner: undefined };
    const childDeps = options.forkDeps
      ? options.forkDeps(baseChildDeps, capabilityScope, effectiveRequest)
      : baseChildDeps;
    const policy = effectiveRequest.runtimePolicy ?? options.policy;
    const result = await worker.run(effectiveRequest.task, childDeps, {
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
