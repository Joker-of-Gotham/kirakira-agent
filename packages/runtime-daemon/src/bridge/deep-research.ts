import { sha256Hex, type DeepResearchConfig, type ResolvedConfig } from "@kirakira/core";
import {
  composeResearchSourceAdapters,
  memoryProviderFromService,
  type MemoryRecallPort,
  type MemorySourceAdapterOptions,
  type ResearchSourceAdapter,
  type ResearchSourceRequest,
} from "@kirakira/deep-research";
import type {
  DeepResearchKernelOptions,
  ResearchTaskKernelInput,
} from "@kirakira/orchestrator-kernel";
import type { RunEvent, RunEventKind } from "@kirakira/runtime-contracts";
import { ulid } from "ulid";

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

export type DaemonRunEventSink = (event: RunEvent) => void | Promise<void>;

export interface DaemonDeepResearchOptions extends DeepResearchKernelOptions {
  memory?: DaemonMemoryResearchSourceOptions | readonly DaemonMemoryResearchSourceOptions[];
  eventSink?: DaemonRunEventSink;
}

export interface DaemonDeepResearchCompositionInput {
  resolvedConfig?: Pick<ResolvedConfig, "agentToml" | "runtimeState">;
  kernelDeepResearch?: DeepResearchKernelOptions;
  daemonDeepResearch?: DaemonDeepResearchOptions;
  eventSink?: DaemonRunEventSink;
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
  const eventSink = input.daemonDeepResearch?.eventSink ?? input.eventSink;

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
          sourceAdapters: (taskInput) =>
            composeResearchSourceAdapters([
              ...adapterSources.flatMap((source) => resolveAdapterSource(source, taskInput)),
              ...memorySources.map((source) => memorySourceAdapter(source, taskInput, eventSink)),
            ]),
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
  eventSink?: DaemonRunEventSink,
): ResearchSourceAdapter {
  const { service, tenantId, workspaceId, runId, sessionId, ...adapterOptions } = source;
  const resolvedTenantId = requireDynamicString("tenantId", tenantId, input);
  const resolvedWorkspaceId = requireDynamicString("workspaceId", workspaceId, input);
  const resolvedRunId = resolveDynamicValue(runId, input) ?? input.runId;
  const resolvedSessionId = resolveDynamicValue(sessionId, input);
  const memoryOptions = {
    ...adapterOptions,
    tenantId: resolvedTenantId,
    workspaceId: resolvedWorkspaceId,
    runId: resolvedRunId,
    sessionId: resolvedSessionId,
  };
  if (!eventSink) {
    return memoryProviderFromService(service, memoryOptions);
  }
  return {
    kind: "memory",
    search(request) {
      return memoryProviderFromService(
        memoryRecallPortWithEvents(service, input, request, eventSink),
        memoryOptions,
      ).search(request);
    },
  };
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

function memoryRecallPortWithEvents(
  service: MemoryRecallPort,
  input: ResearchTaskKernelInput,
  sourceRequest: ResearchSourceRequest,
  eventSink: DaemonRunEventSink | undefined,
): MemoryRecallPort {
  if (!eventSink) return service;
  return {
    async recall(request) {
      const operationId = ulid();
      const startedAt = Date.now();
      const basePayload = memoryRecallRequestPayload(operationId, input, sourceRequest, request);
      await emitDaemonMemoryEvent(eventSink, input.runId, "memory.recall.started", basePayload);
      try {
        const bundle = await service.recall(request);
        await emitDaemonMemoryEvent(
          eventSink,
          input.runId,
          "memory.recall.completed",
          {
            ...basePayload,
            ...memoryRecallBundlePayload(bundle),
            durationMs: Date.now() - startedAt,
          },
        );
        return bundle;
      } catch (error) {
        await emitDaemonMemoryEvent(
          eventSink,
          input.runId,
          "memory.recall.failed",
          {
            ...basePayload,
            durationMs: Date.now() - startedAt,
            error: errorMessage(error),
          },
        );
        throw error;
      }
    },
    async explainRetrieval(...args) {
      return service.explainRetrieval(...args);
    },
  };
}

function memoryRecallRequestPayload(
  operationId: string,
  input: ResearchTaskKernelInput,
  sourceRequest: ResearchSourceRequest,
  request: Parameters<MemoryRecallPort["recall"]>[0],
): Record<string, unknown> {
  return compactRecord({
    memoryOperationId: operationId,
    operation: "recall",
    sourceKind: "memory",
    runId: request.runId ?? input.runId,
    researchRunId: `${input.runId}:${input.node.id}:research`,
    researchTaskId: sourceRequest.taskId,
    parentTaskId: input.node.id,
    nodeId: input.node.id,
    traceId: input.traceId,
    tenantId: request.tenantId,
    workspaceId: request.workspaceId,
    namespace: typeof request.namespace === "string" ? request.namespace : undefined,
    kinds: request.kinds,
    sessionId: request.sessionId,
    queryHash: sha256Hex(request.query),
    queryPreview: preview(request.query),
    level: request.level,
    tokenBudget: request.tokenBudget,
    limit: request.limit,
    includeRedacted: request.includeRedacted,
    requireCitations: sourceRequest.requireCitations,
    limits: requestLimits(sourceRequest, request),
  });
}

function requestLimits(
  sourceRequest: ResearchSourceRequest,
  request: Parameters<MemoryRecallPort["recall"]>[0],
): Record<string, unknown> | undefined {
  const tokenBudget = request.tokenBudget;
  const limit = request.limit;
  return compactRecord({
    ...sourceRequest.limits,
    tokenBudget,
    limit,
  });
}

function memoryRecallBundlePayload(
  bundle: Awaited<ReturnType<MemoryRecallPort["recall"]>>,
): Record<string, unknown> {
  const routeNames = uniqueStrings([
    ...bundle.trace.routePlan,
    ...bundle.trace.routes.map((route) => route.routeName),
  ]);
  const candidateCount = bundle.trace.routes.reduce(
    (sum, route) => sum + route.candidates.length,
    0,
  );
  return compactRecord({
    bundleId: bundle.id,
    queryId: bundle.queryId,
    retrievalTraceId: bundle.trace.traceId,
    routeNames,
    selectedRecordIds: bundle.trace.fusionScores
      .filter((score) => score.selected)
      .map((score) => score.recordId)
      .slice(0, 50),
    recordIds: bundle.recordIds.slice(0, 50),
    totalTokens: bundle.totalTokens,
    budgetLevel: bundle.trace.budgetLevel,
    budgetDegradationReason: bundle.trace.budgetDegradationReason,
    routeCount: bundle.trace.routes.length,
    candidateCount,
    evidenceCount: bundle.context.levels.l3?.evidence?.length,
    citationCount:
      (bundle.context.levels.l3?.evidence?.length ?? 0) +
      (bundle.context.levels.l2?.cards?.length ?? 0),
    metadata: compactRecord({
      createdAt: bundle.createdAt,
      normalizedQueryHash: sha256Hex(bundle.trace.normalizedQuery),
      traceCreatedAt: bundle.trace.createdAt,
      totalDurationMs: bundle.trace.totalDurationMs,
    }),
  });
}

async function emitDaemonMemoryEvent(
  eventSink: DaemonRunEventSink,
  runId: string,
  kind: RunEventKind,
  payload: Record<string, unknown>,
): Promise<void> {
  await eventSink({
    id: ulid(),
    runId,
    timestamp: new Date().toISOString(),
    kind,
    payload: compactRecord(payload),
  });
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)].filter((value) => value.length > 0);
}

function preview(value: string, max = 160): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? preview(error.message, 240) : preview(String(error), 240);
}
