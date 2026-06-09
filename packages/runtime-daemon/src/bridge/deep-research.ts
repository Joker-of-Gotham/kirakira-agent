import type { DeepResearchConfig, ResolvedConfig } from "@kirakira/core";
import {
  memoryProviderFromService,
  type MemoryRecallPort,
  type MemorySourceAdapterOptions,
  type ResearchSourceAdapter,
} from "@kirakira/deep-research";
import type {
  DeepResearchKernelOptions,
  ResearchTaskKernelInput,
} from "@kirakira/orchestrator-kernel";

type DynamicValue<T> = T | ((input: ResearchTaskKernelInput) => T | undefined);

type AdapterSource = NonNullable<DeepResearchKernelOptions["sourceAdapters"]>;
type ConfigSource = NonNullable<DeepResearchKernelOptions["config"]>;

export interface DaemonMemoryResearchSourceOptions
  extends Omit<
    MemorySourceAdapterOptions,
    "tenantId" | "workspaceId" | "runId" | "sessionId"
  > {
  service: MemoryRecallPort;
  tenantId: DynamicValue<string>;
  workspaceId: DynamicValue<string>;
  runId?: DynamicValue<string>;
  sessionId?: DynamicValue<string>;
}

export interface DaemonDeepResearchOptions extends DeepResearchKernelOptions {
  memory?: DaemonMemoryResearchSourceOptions | readonly DaemonMemoryResearchSourceOptions[];
}

export interface DaemonDeepResearchCompositionInput {
  resolvedConfig?: Pick<ResolvedConfig, "agentToml">;
  kernelDeepResearch?: DeepResearchKernelOptions;
  daemonDeepResearch?: DaemonDeepResearchOptions;
}

export function createDaemonDeepResearchKernelOptions(
  input: DaemonDeepResearchCompositionInput,
): DeepResearchKernelOptions | undefined {
  const configSources = [
    input.resolvedConfig?.agentToml.deep_research,
    input.kernelDeepResearch?.config,
    input.daemonDeepResearch?.config,
  ].filter((source): source is DeepResearchConfig | ConfigSource => source !== undefined);
  const adapterSources = [
    input.kernelDeepResearch?.sourceAdapters,
    input.daemonDeepResearch?.sourceAdapters,
  ].filter((source): source is AdapterSource => source !== undefined);
  const memorySources = normalizeMemorySources(input.daemonDeepResearch?.memory);
  const planner = input.daemonDeepResearch?.planner ?? input.kernelDeepResearch?.planner;

  if (
    configSources.length === 0 &&
    adapterSources.length === 0 &&
    memorySources.length === 0 &&
    planner === undefined
  ) {
    return undefined;
  }

  return {
    ...(configSources.length > 0
      ? {
          config: (taskInput) =>
            mergeDeepResearchConfig(
              ...configSources.map((source) => resolveConfigSource(source, taskInput)),
            ),
        }
      : {}),
    ...(adapterSources.length > 0 || memorySources.length > 0
      ? {
          sourceAdapters: (taskInput) => [
            ...adapterSources.flatMap((source) => resolveAdapterSource(source, taskInput)),
            ...memorySources.map((source) => memorySourceAdapter(source, taskInput)),
          ],
        }
      : {}),
    ...(planner !== undefined ? { planner } : {}),
  };
}

function normalizeMemorySources(
  value: DaemonDeepResearchOptions["memory"],
): DaemonMemoryResearchSourceOptions[] {
  if (!value) return [];
  if (Array.isArray(value)) return [...value];
  return [value as DaemonMemoryResearchSourceOptions];
}

function resolveDynamicValue<T>(
  value: DynamicValue<T> | undefined,
  input: ResearchTaskKernelInput,
): T | undefined {
  if (typeof value === "function") {
    return (value as (taskInput: ResearchTaskKernelInput) => T | undefined)(input);
  }
  return value;
}

function resolveConfigSource(
  source: DeepResearchConfig | ConfigSource,
  input: ResearchTaskKernelInput,
): DeepResearchConfig | undefined {
  return typeof source === "function" ? source(input) : source;
}

function resolveAdapterSource(
  source: AdapterSource,
  input: ResearchTaskKernelInput,
): ResearchSourceAdapter[] {
  const adapters = typeof source === "function" ? source(input) : source;
  return [...(adapters ?? [])];
}

function mergeDeepResearchConfig(
  ...configs: Array<DeepResearchConfig | undefined>
): DeepResearchConfig | undefined {
  const merged = Object.assign({}, ...configs.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function memorySourceAdapter(
  source: DaemonMemoryResearchSourceOptions,
  input: ResearchTaskKernelInput,
): ResearchSourceAdapter {
  const { service, tenantId, workspaceId, runId, sessionId, ...adapterOptions } = source;
  return memoryProviderFromService(service, {
    ...adapterOptions,
    tenantId: requireDynamicString("tenantId", tenantId, input),
    workspaceId: requireDynamicString("workspaceId", workspaceId, input),
    runId: resolveDynamicValue(runId, input) ?? input.runId,
    sessionId: resolveDynamicValue(sessionId, input),
  });
}

function requireDynamicString(
  field: string,
  value: DynamicValue<string>,
  input: ResearchTaskKernelInput,
): string {
  const resolved = resolveDynamicValue(value, input);
  if (typeof resolved === "string" && resolved.trim().length > 0) {
    return resolved.trim();
  }
  throw new Error(`deep_research memory source requires ${field}`);
}
