import { sha256Hex } from "@kirakira/core";

import type {
  DeepResearchLimits,
  ResearchCitation,
  ResearchEvidence,
  ResearchSourceAdapter,
  ResearchSourceRequest,
} from "./types.js";

export interface McpResearchTraceContextCarrier {
  traceparent?: string;
  tracestate?: string;
  baggage?: string;
}

export interface McpResearchRuntimeContext {
  runId?: string;
  traceId?: string;
  traceContext?: McpResearchTraceContextCarrier;
  subagentId?: string;
  role?: string;
  requestedLane?: string;
}

export interface McpResearchToolCallRequest extends McpResearchRuntimeContext {
  server: string;
  tool: string;
  arguments?: Record<string, unknown>;
}

export interface McpResearchToolCallResult {
  server: string;
  tool: string;
  success: boolean;
  content?: unknown;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  error?: string;
  latencyMs?: number;
  policy?: unknown;
  trust?: unknown;
  audit?: unknown;
  otel?: unknown;
}

export interface McpResearchToolCallPort {
  callTool(request: McpResearchToolCallRequest): Promise<McpResearchToolCallResult>;
}

export type McpResearchToolArguments =
  | Record<string, unknown>
  | ((
      request: ResearchSourceRequest,
      target: McpResearchToolTarget,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>);

export interface McpResearchToolTarget {
  server: string;
  tool: string;
  title?: string;
  uri?: string;
  arguments?: McpResearchToolArguments;
  metadata?: Record<string, unknown>;
}

export type McpResearchToolResolver = (
  request: ResearchSourceRequest,
) =>
  | readonly McpResearchToolTarget[]
  | Promise<readonly McpResearchToolTarget[]>;

export interface McpResearchSourceAdapterOptions {
  port: McpResearchToolCallPort;
  targets: readonly McpResearchToolTarget[] | McpResearchToolResolver;
  context?:
    | McpResearchRuntimeContext
    | ((
        request: ResearchSourceRequest,
        target: McpResearchToolTarget,
      ) => McpResearchRuntimeContext | undefined);
  retrievedAt?: string | (() => string);
  maxEvidence?: number;
  includeErrorEvidence?: boolean;
}

const DEFAULT_MAX_EVIDENCE = 6;

export function mcpProviderFromToolCalls(
  options: McpResearchSourceAdapterOptions,
): ResearchSourceAdapter {
  return {
    kind: "mcp",
    async search(request) {
      const targets = await resolveTargets(request, options.targets);
      const evidence: ResearchEvidence[] = [];
      for (const target of targets) {
        if (evidence.length >= evidenceLimit(request, options)) break;
        const result = await options.port.callTool({
          server: target.server,
          tool: target.tool,
          arguments: await targetArguments(request, target),
          ...runtimeContext(request, target, options),
        });
        evidence.push(...evidenceFromToolResult(result, target, request, options));
      }
      return evidence.slice(0, evidenceLimit(request, options));
    },
  };
}

async function resolveTargets(
  request: ResearchSourceRequest,
  targets: McpResearchSourceAdapterOptions["targets"],
): Promise<McpResearchToolTarget[]> {
  const resolved = typeof targets === "function" ? await targets(request) : targets;
  return resolved
    .filter((target) => target.server.trim().length > 0 && target.tool.trim().length > 0)
    .map((target) => ({
      ...target,
      server: target.server.trim(),
      tool: target.tool.trim(),
    }));
}

async function targetArguments(
  request: ResearchSourceRequest,
  target: McpResearchToolTarget,
): Promise<Record<string, unknown>> {
  if (typeof target.arguments === "function") {
    return target.arguments(request, target);
  }
  return target.arguments ?? defaultToolArguments(request);
}

function defaultToolArguments(request: ResearchSourceRequest): Record<string, unknown> {
  return {
    query: request.query,
    taskId: request.taskId,
    sourceKind: request.sourceKind,
    limits: limitsPayload(request.limits),
    requireCitations: request.requireCitations,
  };
}

function limitsPayload(limits: DeepResearchLimits): Record<string, number> {
  return {
    maxDepth: limits.maxDepth,
    maxBreadth: limits.maxBreadth,
    maxToolCalls: limits.maxToolCalls,
  };
}

function runtimeContext(
  request: ResearchSourceRequest,
  target: McpResearchToolTarget,
  options: McpResearchSourceAdapterOptions,
): McpResearchRuntimeContext {
  if (typeof options.context === "function") {
    return options.context(request, target) ?? {};
  }
  return options.context ?? {};
}

function evidenceFromToolResult(
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
): ResearchEvidence[] {
  if (result.success !== true || result.isError === true) {
    return options.includeErrorEvidence === false
      ? []
      : [errorEvidence(result, target, request, options)];
  }

  const structured = structuredEvidence(result, target, request, options);
  if (structured.length > 0) return structured;

  return [genericEvidence(result, target, request, options)];
}

function structuredEvidence(
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
): ResearchEvidence[] {
  const structured = result.structuredContent;
  const items = Array.isArray(structured?.evidence)
    ? structured.evidence.filter(isRecord)
    : [];
  if (items.length === 0) return [];

  return items.map((item, index) => {
    const evidenceId = evidenceIdFor(target, request, `structured:${index}`);
    const citations = citationsFromStructuredContent(
      result,
      target,
      request,
      options,
      evidenceId,
      item.citations,
    );
    return {
      id: evidenceId,
      sourceKind: "mcp",
      query: request.query,
      title: stringField(item, "title") ?? targetTitle(target),
      summary: stringField(item, "summary") ?? `MCP tool ${target.server}:${target.tool} returned structured evidence.`,
      content: stringField(item, "content") ?? stringifyForEvidence(item.content),
      confidence: numberField(item, "confidence") ?? confidenceFromResult(result),
      citations,
      metadata: metadataForResult(result, target, item.metadata),
    };
  });
}

function genericEvidence(
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
): ResearchEvidence {
  const evidenceId = evidenceIdFor(target, request, "generic");
  const text = textFromContent(result.content) ??
    stringifyForEvidence(result.structuredContent) ??
    "MCP tool returned no text content.";
  return {
    id: evidenceId,
    sourceKind: "mcp",
    query: request.query,
    title: targetTitle(target),
    summary: `MCP tool ${target.server}:${target.tool} returned evidence.`,
    content: preview(text, 2400),
    confidence: confidenceFromResult(result),
    citations: citationsFromStructuredContent(result, target, request, options, evidenceId),
    metadata: metadataForResult(result, target),
  };
}

function errorEvidence(
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
): ResearchEvidence {
  const evidenceId = evidenceIdFor(target, request, "error");
  const text = result.error ??
    textFromContent(result.content) ??
    stringifyForEvidence(result.structuredContent) ??
    "MCP tool returned an error.";
  return {
    id: evidenceId,
    sourceKind: "mcp",
    query: request.query,
    title: targetTitle(target),
    summary: `MCP tool ${target.server}:${target.tool} returned an error.`,
    content: preview(text, 1200),
    confidence: 0,
    citations: [defaultCitation(result, target, request, options, evidenceId)],
    metadata: metadataForResult(result, target),
  };
}

function citationsFromStructuredContent(
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
  evidenceId: string,
  itemCitations?: unknown,
): ResearchCitation[] {
  const rawCitations = [
    ...(Array.isArray(itemCitations) ? itemCitations : []),
    ...(Array.isArray(result.structuredContent?.citations)
      ? result.structuredContent.citations
      : []),
    ...resourceLinkCitations(result.content),
  ];
  const citations = rawCitations
    .filter(isRecord)
    .map((citation, index) =>
      citationFromRecord(citation, result, target, request, options, evidenceId, index),
    );
  if (citations.length > 0) return citations;
  return [defaultCitation(result, target, request, options, evidenceId)];
}

function citationFromRecord(
  citation: Record<string, unknown>,
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
  evidenceId: string,
  index: number,
): ResearchCitation {
  const uri = stringField(citation, "uri") ??
    stringField(citation, "url") ??
    stringField(citation, "source") ??
    targetUri(target);
  const id = stringField(citation, "id") ??
    `mcp:${sha256Hex(`${target.server}:${target.tool}:${uri}:${index}`).slice(0, 16)}`;
  return {
    id,
    sourceKind: "mcp",
    title: stringField(citation, "title") ?? targetTitle(target),
    uri,
    retrievedAt: retrievedAt(options),
    traceId: stringField(result.otel, "traceId"),
    queryId: request.taskId,
    sourceRecordId: stringField(citation, "sourceRecordId") ?? `${target.server}:${target.tool}`,
    evidenceIds: [evidenceId],
    provenanceIds: provenanceIds(result),
    score: numberField(citation, "score"),
    metadata: metadataForResult(result, target, citation.metadata),
  };
}

function defaultCitation(
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
  evidenceId: string,
): ResearchCitation {
  return {
    id: `mcp:${sha256Hex(`${target.server}:${target.tool}:${request.query}`).slice(0, 16)}`,
    sourceKind: "mcp",
    title: targetTitle(target),
    uri: targetUri(target),
    retrievedAt: retrievedAt(options),
    traceId: stringField(result.otel, "traceId"),
    queryId: request.taskId,
    sourceRecordId: `${target.server}:${target.tool}`,
    evidenceIds: [evidenceId],
    provenanceIds: provenanceIds(result),
    metadata: metadataForResult(result, target),
  };
}

function resourceLinkCitations(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord).flatMap((block) => {
    if (block.type === "resource_link" && typeof block.uri === "string") {
      return [{
        uri: block.uri,
        title: stringField(block, "name") ?? stringField(block, "title"),
      }];
    }
    const resource = isRecord(block.resource) ? block.resource : undefined;
    if (block.type === "resource" && typeof resource?.uri === "string") {
      return [{
        uri: resource.uri,
        title: stringField(resource, "name") ?? stringField(resource, "title"),
      }];
    }
    return [];
  });
}

function textFromContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return typeof content === "string" ? content : undefined;
  const text = content
    .map((block) => {
      if (!isRecord(block)) return undefined;
      if (typeof block.text === "string") return block.text;
      const resource = isRecord(block.resource) ? block.resource : undefined;
      if (typeof resource?.text === "string") return resource.text;
      return undefined;
    })
    .filter((item): item is string => item !== undefined)
    .join("\n")
    .trim();
  return text.length > 0 ? text : undefined;
}

function stringifyForEvidence(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function metadataForResult(
  result: McpResearchToolCallResult,
  target: McpResearchToolTarget,
  extra?: unknown,
): Record<string, unknown> {
  return compactRecord({
    ...sanitizeMetadata(target.metadata),
    ...sanitizeMetadata(extra),
    server: target.server,
    tool: target.tool,
    success: result.success,
    isError: result.isError,
    latencyMs: result.latencyMs,
    policyEffect: stringField(result.policy, "effect"),
    policyTraceId: stringField(result.policy, "traceId"),
    decisionId: stringField(result.policy, "decisionId"),
    trustTier: stringField(result.trust, "tier"),
    otelSpanName: stringField(result.otel, "spanName"),
    otelSpanId: stringField(result.otel, "spanId"),
    otelStatus: stringField(result.otel, "status"),
  });
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) =>
      item === null ||
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean",
    ),
  );
}

function provenanceIds(result: McpResearchToolCallResult): string[] | undefined {
  const values = [
    stringField(result.policy, "decisionId"),
    stringField(result.otel, "spanId"),
  ].filter((value): value is string => value !== undefined && value.length > 0);
  return values.length > 0 ? values : undefined;
}

function evidenceIdFor(
  target: McpResearchToolTarget,
  request: ResearchSourceRequest,
  suffix: string,
): string {
  return `mcp-evidence:${sha256Hex(`${target.server}:${target.tool}:${request.taskId}:${request.query}:${suffix}`).slice(0, 16)}`;
}

function targetTitle(target: McpResearchToolTarget): string {
  return target.title ?? `${target.server}:${target.tool}`;
}

function targetUri(target: McpResearchToolTarget): string {
  return target.uri ?? `mcp://${encodeURIComponent(target.server)}/${encodeURIComponent(target.tool)}`;
}

function confidenceFromResult(result: McpResearchToolCallResult): number {
  return result.success && result.isError !== true ? 0.72 : 0;
}

function evidenceLimit(
  request: ResearchSourceRequest,
  options: McpResearchSourceAdapterOptions,
): number {
  return Math.max(
    1,
    Math.min(
      request.limits.maxBreadth,
      positiveInteger(options.maxEvidence, DEFAULT_MAX_EVIDENCE),
    ),
  );
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

function retrievedAt(options: McpResearchSourceAdapterOptions): string {
  if (typeof options.retrievedAt === "function") return options.retrievedAt();
  return options.retrievedAt ?? new Date().toISOString();
}

function stringField(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  return typeof item === "string" && item.length > 0 ? item : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const item = value[key];
  return typeof item === "number" && Number.isFinite(item) ? item : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactRecord(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function preview(value: string, max: number): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}
