import type { ResolvedConfig } from "@kirakira/core";
import {
  McpGatewayContextFactory,
  mcpMetaFromSpanHandle,
  normalizeMcpTraceContextCarrier,
  filterTools,
  type McpAuditBridge,
  type McpClientManager,
  type McpGatewayAuditContext,
  type McpGatewayOtelContext,
  type McpGatewayPolicyContext,
  type McpGatewayServerContext,
  type McpGatewayToolContext,
  type McpGatewayTrustContext,
  type McpOtelRecorderPlan,
  type McpOtelSdkFactory,
  type McpSpanAttributes,
  type McpSpanExporter,
  type McpSpanHandle,
  type McpSpanRecorder,
  type McpSpanStatusCode,
  type McpTraceContextCarrier,
  type OpenTelemetryApiLike,
} from "@kirakira/mcp-adapter";
import {
  McpPep,
  type AuditWriter,
  type EnforcementResult,
  type PepContext,
} from "@kirakira/policy-engine";
import type {
  RuntimeMcpListRequest,
  RuntimeMcpListResult,
  RuntimeMcpServerHealth,
  RuntimeMcpAuditMetadata,
  RuntimeMcpOtelMetadata,
  RuntimeMcpPolicyMetadata,
  RuntimeMcpTrustMetadata,
  RuntimeMcpToolSummary,
  RuntimeMcpToolCallRequest,
  RuntimeMcpToolCallResult,
  RuntimeMcpToolPolicyResult,
  RuntimeMcpOtelSpanStatus,
  RuntimeMcpTraceContextCarrier,
} from "@kirakira/runtime-contracts";
import { ulid } from "ulid";
import { createDaemonMcpDependencies } from "./mcp-runtime-deps.js";

export interface DaemonMcpRuntimeOptions {
  workspaceRoot: string;
  mcpConfigPath?: string;
  resolvedConfig?: Pick<ResolvedConfig, "runtimeState">;
  runtimeProfileName?: string;
  policyBundlePath?: string;
  mcpManager?: McpClientManager;
  mcpPep?: McpPep;
  mcpAuditBridge?: McpAuditBridge | null;
  mcpSpanRecorder?: McpSpanRecorder | null;
  mcpOtelRecorderPlan?: McpOtelRecorderPlan;
  mcpOtelApi?: OpenTelemetryApiLike;
  mcpOtelExporter?: McpSpanExporter;
  mcpOtelSdkFactory?: McpOtelSdkFactory | null;
  mcpOtelEnv?: Record<string, string | undefined>;
  auditWriter?: AuditWriter;
  userId?: string;
}

export type DaemonMcpToolCallInput = RuntimeMcpToolCallRequest;
export type DaemonMcpListInput = RuntimeMcpListRequest;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

type RuntimeMcpCallFailureType =
  | "invalid_params"
  | "server_not_found"
  | "tool_not_found"
  | "adapter_error";

interface RuntimeMcpCallFailure {
  type: RuntimeMcpCallFailureType;
  message: string;
  jsonRpcCode: number;
  data?: Record<string, unknown>;
}

interface ValidatedMcpCallRequest {
  input: RuntimeMcpToolCallRequest;
  args: Record<string, unknown>;
}

const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_INTERNAL_ERROR = -32603;

function errorTypeFrom(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return "error";
}

function safeRequestedInput(input: RuntimeMcpToolCallRequest): RuntimeMcpToolCallRequest {
  const raw = input as unknown;
  if (!isRecord(raw)) {
    return {
      server: "unknown",
      tool: "unknown",
    };
  }
  const traceContext = isRecord(raw.traceContext)
    ? {
        ...(typeof raw.traceContext.traceparent === "string"
          ? { traceparent: raw.traceContext.traceparent }
          : {}),
        ...(typeof raw.traceContext.tracestate === "string"
          ? { tracestate: raw.traceContext.tracestate }
          : {}),
        ...(typeof raw.traceContext.baggage === "string" ? { baggage: raw.traceContext.baggage } : {}),
      }
    : undefined;
  return {
    server: typeof raw.server === "string" && raw.server.length > 0 ? raw.server : "unknown",
    tool: typeof raw.tool === "string" && raw.tool.length > 0 ? raw.tool : "unknown",
    ...(isRecord(raw.arguments) ? { arguments: raw.arguments } : {}),
    ...(typeof raw.runId === "string" ? { runId: raw.runId } : {}),
    ...(typeof raw.traceId === "string" ? { traceId: raw.traceId } : {}),
    ...(traceContext !== undefined ? { traceContext } : {}),
    ...(typeof raw.subagentId === "string" ? { subagentId: raw.subagentId } : {}),
    ...(typeof raw.role === "string" ? { role: raw.role } : {}),
    ...(typeof raw.requestedLane === "string" ? { requestedLane: raw.requestedLane } : {}),
  };
}

function validateMcpCallInput(input: RuntimeMcpToolCallRequest): ValidatedMcpCallRequest | RuntimeMcpCallFailure {
  const raw = input as unknown;
  if (!isRecord(raw)) {
    return {
      type: "invalid_params",
      message: "MCP tools/call request must be a JSON object",
      jsonRpcCode: JSON_RPC_INVALID_PARAMS,
    };
  }
  if (typeof raw.server !== "string" || raw.server.length === 0) {
    return {
      type: "invalid_params",
      message: "MCP tools/call request requires a server name",
      jsonRpcCode: JSON_RPC_INVALID_PARAMS,
    };
  }
  if (typeof raw.tool !== "string" || raw.tool.length === 0) {
    return {
      type: "invalid_params",
      message: "MCP tools/call request requires a tool name",
      jsonRpcCode: JSON_RPC_INVALID_PARAMS,
    };
  }
  if (raw.arguments !== undefined && !isRecord(raw.arguments)) {
    return {
      type: "invalid_params",
      message: "MCP tools/call arguments must be a JSON object",
      jsonRpcCode: JSON_RPC_INVALID_PARAMS,
      data: { server: raw.server, tool: raw.tool },
    };
  }
  return {
    input: safeRequestedInput(input),
    args: isRecord(raw.arguments) ? raw.arguments : {},
  };
}

function serverNotFoundFailure(server: string): RuntimeMcpCallFailure {
  return {
    type: "server_not_found",
    message: `Unknown MCP server: ${server}`,
    jsonRpcCode: JSON_RPC_INVALID_PARAMS,
    data: { server },
  };
}

function toolNotFoundFailure(server: string, tool: string): RuntimeMcpCallFailure {
  return {
    type: "tool_not_found",
    message: `Unknown MCP tool: ${server}:${tool}`,
    jsonRpcCode: JSON_RPC_INVALID_PARAMS,
    data: { server, tool },
  };
}

function adapterFailure(error: unknown): RuntimeMcpCallFailure {
  return {
    type: "adapter_error",
    message: error instanceof Error ? error.message : String(error),
    jsonRpcCode: JSON_RPC_INTERNAL_ERROR,
  };
}

function failureAttributes(failure: RuntimeMcpCallFailure): McpSpanAttributes {
  return {
    "error.type": failure.type,
    "rpc.response.status_code": String(failure.jsonRpcCode),
  };
}

function failureStructuredContent(failure: RuntimeMcpCallFailure): Record<string, unknown> {
  return {
    error: {
      type: failure.type,
      jsonrpc: {
        code: failure.jsonRpcCode,
        message: failure.message,
        ...(failure.data !== undefined ? { data: failure.data } : {}),
      },
    },
  };
}

function policyResultForFailure(
  input: RuntimeMcpToolCallRequest,
  failure: RuntimeMcpCallFailure,
): RuntimeMcpToolPolicyResult {
  return {
    effect: "deny",
    reasonCodes: [`mcp_${failure.type}`],
    approvalRequired: false,
    traceId: input.traceId ?? ulid(),
  };
}

function textFromContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((block) => isRecord(block) && typeof block.text === "string" ? block.text : undefined)
    .filter((item): item is string => item !== undefined)
    .join("\n")
    .trim();
  return text.length > 0 ? text : undefined;
}

function policyResultFromEnforcement(
  result: EnforcementResult,
): RuntimeMcpToolPolicyResult {
  return {
    effect: result.decision.effect,
    reasonCodes: result.decision.reason_codes ?? [],
    approvalRequired: result.decision.approval?.required ?? result.decision.effect === "escalate",
    traceId: result.traceId,
    decisionId: result.decision.decision_id,
    summary: result.decision.explain?.summary,
  };
}

interface RuntimeMcpSpanProjection {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  traceContext?: RuntimeMcpTraceContextCarrier;
  status?: RuntimeMcpOtelSpanStatus;
  durationMs?: number;
  attributes?: McpSpanAttributes;
}

function resultFrom(
  input: RuntimeMcpToolCallRequest,
  startedAt: number,
  policy: RuntimeMcpToolPolicyResult,
  context: McpGatewayToolContext,
  overrides: Partial<Omit<RuntimeMcpToolCallResult, "server" | "tool" | "latencyMs" | "policy">>,
  span?: RuntimeMcpSpanProjection,
): RuntimeMcpToolCallResult {
  return {
    server: input.server,
    tool: input.tool,
    success: overrides.success ?? false,
    ...(overrides.content !== undefined ? { content: overrides.content } : {}),
    ...(overrides.structuredContent !== undefined
      ? { structuredContent: overrides.structuredContent }
      : {}),
    ...(overrides.isError !== undefined ? { isError: overrides.isError } : {}),
    ...(overrides.error !== undefined ? { error: overrides.error } : {}),
    latencyMs: Date.now() - startedAt,
    policy,
    trust: projectTrust(context.trust),
    audit: withAuditDecision(projectAudit(context.audit), policy.decisionId),
    otel: projectOtel(context.otel, span),
  };
}

function projectMcpResult(raw: unknown): Pick<
  RuntimeMcpToolCallResult,
  "success" | "content" | "structuredContent" | "isError" | "error"
> {
  if (!isRecord(raw)) {
    return {
      success: true,
      content: raw,
    };
  }
  const isError = typeof raw.isError === "boolean" ? raw.isError : undefined;
  const error = isError === true
    ? textFromContent(raw.content) ?? "MCP tool returned isError=true"
    : undefined;
  return {
    success: isError !== true,
    ...(raw.content !== undefined ? { content: raw.content } : {}),
    ...(isRecord(raw.structuredContent)
      ? { structuredContent: raw.structuredContent }
      : {}),
    ...(isError !== undefined ? { isError } : {}),
    ...(error !== undefined ? { error } : {}),
  };
}

interface DiscoveredMcpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execution?: Record<string, unknown>;
}

interface ActiveRuntimeMcpSpan {
  startedAt: number;
  handle?: McpSpanHandle;
  traceContext?: McpTraceContextCarrier;
}

function projectTrust(context: McpGatewayTrustContext): RuntimeMcpTrustMetadata {
  return {
    tier: context.tier,
    source: context.source,
    trustedAnnotations: context.trustedAnnotations,
    firstUse: context.firstUse,
    ...(context.configuredLevel !== undefined ? { configuredLevel: context.configuredLevel } : {}),
    ...(context.transportKind !== undefined ? { transportKind: context.transportKind } : {}),
    ...(context.authMode !== undefined ? { authMode: context.authMode } : {}),
    ...(context.serverUrl !== undefined ? { serverUrl: context.serverUrl } : {}),
    ...(context.issuer !== undefined ? { issuer: context.issuer } : {}),
  };
}

function projectPolicy(context: McpGatewayPolicyContext): RuntimeMcpPolicyMetadata {
  return {
    decision: context.decision,
    source: context.source,
    reasonCodes: context.reasonCodes,
    approvalRequired: context.approvalRequired,
    obligations: context.obligations,
    ...(context.traceId !== undefined ? { traceId: context.traceId } : {}),
    ...(context.decisionId !== undefined ? { decisionId: context.decisionId } : {}),
  };
}

function projectAudit(context: McpGatewayAuditContext): RuntimeMcpAuditMetadata {
  return {
    auditRequired: context.auditRequired,
    eventKinds: context.eventKinds,
    ledger: context.ledger,
    ...(context.decisionId !== undefined ? { decisionId: context.decisionId } : {}),
  };
}

function withAuditDecision(
  audit: RuntimeMcpAuditMetadata,
  decisionId: string | undefined,
): RuntimeMcpAuditMetadata {
  return decisionId === undefined ? audit : { ...audit, decisionId };
}

function projectOtel(
  context: McpGatewayOtelContext,
  span?: RuntimeMcpSpanProjection,
): RuntimeMcpOtelMetadata {
  return {
    spanName: context.spanName,
    attributes: {
      ...context.attributes,
      ...(span?.attributes ?? {}),
    },
    ...(span?.traceId !== undefined ? { traceId: span.traceId } : {}),
    ...(span?.spanId !== undefined ? { spanId: span.spanId } : {}),
    ...(span?.parentSpanId !== undefined ? { parentSpanId: span.parentSpanId } : {}),
    ...(span?.traceContext !== undefined ? { traceContext: span.traceContext } : {}),
    ...(span?.status !== undefined ? { status: span.status } : {}),
    ...(span?.durationMs !== undefined ? { durationMs: span.durationMs } : {}),
  };
}

function projectTool(tool: DiscoveredMcpTool, context: McpGatewayToolContext): RuntimeMcpToolSummary {
  return {
    name: tool.name,
    ...(tool.title !== undefined ? { title: tool.title } : {}),
    ...(tool.description !== undefined ? { description: tool.description } : {}),
    ...(tool.inputSchema !== undefined ? { inputSchema: tool.inputSchema } : {}),
    ...(tool.outputSchema !== undefined ? { outputSchema: tool.outputSchema } : {}),
    ...(tool.annotations !== undefined ? { annotations: tool.annotations } : {}),
    ...(tool.execution !== undefined ? { execution: tool.execution } : {}),
    policy: projectPolicy(context.policy),
    trust: projectTrust(context.trust),
    audit: projectAudit(context.audit),
    otel: projectOtel(context.otel),
  };
}

function extractToolsFromResult(raw: unknown): DiscoveredMcpTool[] {
  if (!isRecord(raw) || !Array.isArray(raw.tools)) return [];
  return raw.tools
    .filter((tool): tool is Record<string, unknown> => isRecord(tool) && typeof tool.name === "string")
    .map((tool) => ({
      name: String(tool.name),
      ...(typeof tool.title === "string" ? { title: tool.title } : {}),
      ...(typeof tool.description === "string" ? { description: tool.description } : {}),
      ...(isRecord(tool.inputSchema) ? { inputSchema: tool.inputSchema } : {}),
      ...(isRecord(tool.outputSchema) ? { outputSchema: tool.outputSchema } : {}),
      ...(isRecord(tool.annotations) ? { annotations: tool.annotations } : {}),
      ...(isRecord(tool.execution) ? { execution: tool.execution } : {}),
    }));
}

export class DaemonMcpRuntime {
  private readonly workspaceRoot: string;
  private readonly manager: McpClientManager;
  private readonly mcpPep: McpPep;
  private readonly mcpAuditBridge?: McpAuditBridge;
  private readonly mcpSpanRecorder?: McpSpanRecorder;
  private readonly contextFactory: McpGatewayContextFactory;
  private readonly closeDeps: () => Promise<void>;
  private readonly userId: string;

  constructor(options: DaemonMcpRuntimeOptions) {
    const deps = createDaemonMcpDependencies(options);
    this.workspaceRoot = deps.workspaceRoot;
    this.manager = deps.mcpManager;
    this.mcpPep = deps.mcpPep;
    this.mcpAuditBridge = deps.mcpAuditBridge;
    this.mcpSpanRecorder = deps.mcpSpanRecorder;
    this.contextFactory = new McpGatewayContextFactory({ manager: this.manager });
    this.closeDeps = deps.close;
    this.userId = options.userId ?? process.env.USERNAME ?? process.env.USER ?? "local-user";
  }

  private startMcpSpan(
    context: McpGatewayOtelContext,
    options: {
      traceId?: string;
      traceContext?: McpTraceContextCarrier;
      attributes?: McpSpanAttributes;
    } = {},
  ): ActiveRuntimeMcpSpan {
    const startedAt = Date.now();
    const traceContext = normalizeMcpTraceContextCarrier(options.traceContext);
    if (this.mcpSpanRecorder === undefined) {
      return traceContext === undefined ? { startedAt } : { startedAt, traceContext };
    }

    try {
      const handle = this.mcpSpanRecorder.startSpan({
        name: context.spanName,
        kind: "CLIENT",
        attributes: {
          ...context.attributes,
          ...(options.traceId !== undefined ? { "kirakira.trace.id": options.traceId } : {}),
          ...(options.attributes ?? {}),
        },
        startTimeUnixMs: startedAt,
        ...(options.traceId !== undefined ? { traceId: options.traceId } : {}),
        ...(traceContext !== undefined ? { traceContext } : {}),
      });
      return traceContext === undefined ? { startedAt, handle } : { startedAt, handle, traceContext };
    } catch {
      return traceContext === undefined ? { startedAt } : { startedAt, traceContext };
    }
  }

  private async finishMcpSpan(
    span: ActiveRuntimeMcpSpan,
    status: McpSpanStatusCode,
    options: {
      message?: string;
      attributes?: McpSpanAttributes;
    } = {},
  ): Promise<RuntimeMcpSpanProjection> {
    const endTimeUnixMs = Date.now();
    await Promise.resolve(
      span.handle?.end({
        status: { code: status, ...(options.message !== undefined ? { message: options.message } : {}) },
        ...(options.attributes !== undefined ? { attributes: options.attributes } : {}),
        endTimeUnixMs,
      }),
    ).catch(() => {});

    const traceContext =
      span.handle !== undefined ? mcpMetaFromSpanHandle(span.handle) : span.traceContext;

    return {
      ...(span.handle?.context.traceId !== undefined ? { traceId: span.handle.context.traceId } : {}),
      ...(span.handle?.context.spanId !== undefined ? { spanId: span.handle.context.spanId } : {}),
      ...(span.handle?.context.parentSpanId !== undefined
        ? { parentSpanId: span.handle.context.parentSpanId }
        : {}),
      ...(traceContext !== undefined ? { traceContext } : {}),
      status,
      durationMs: Math.max(0, endTimeUnixMs - span.startedAt),
      ...(options.attributes !== undefined ? { attributes: options.attributes } : {}),
    };
  }

  private withMcpTraceMeta<T extends Record<string, unknown>>(
    params: T,
    span: ActiveRuntimeMcpSpan,
  ): T {
    const traceMeta =
      span.handle !== undefined ? mcpMetaFromSpanHandle(span.handle) : span.traceContext;
    if (traceMeta === undefined) return params;
    const existingMeta = isRecord(params._meta) ? params._meta : {};
    return {
      ...params,
      _meta: {
        ...existingMeta,
        ...traceMeta,
      },
    } as T;
  }

  private pepContext(input: RuntimeMcpToolCallRequest): PepContext {
    const sessionId = input.runId ?? "daemon";
    return {
      sessionId,
      traceId: input.traceId ?? ulid(),
      userId: this.userId,
      workspaceRoot: this.workspaceRoot,
      interactive: false,
      roles: [],
      ...(input.subagentId !== undefined || input.role !== undefined || input.requestedLane !== undefined
        ? {
            agent: {
              ...(input.subagentId !== undefined ? { subagentId: input.subagentId } : {}),
              ...(input.role !== undefined ? { role: input.role } : {}),
              ...(input.requestedLane !== undefined ? { lane: input.requestedLane, requestedLane: input.requestedLane } : {}),
            },
          }
        : {}),
    };
  }

  private async recordConnection(
    context: McpGatewayServerContext,
    status: "connected" | "failed" | "disconnected",
    sessionId: string,
    traceId: string,
  ): Promise<void> {
    await this.mcpAuditBridge?.recordConnection({
      serverId: context.server,
      trustTier: context.trust.tier,
      transport: context.trust.transportKind ?? "unknown",
      status,
      userId: this.userId,
      sessionId,
      traceId,
    }).catch(() => {});
  }

  private async ensureServerStarted(
    server: string,
    context: McpGatewayServerContext,
    sessionId: string,
    traceId: string,
  ): Promise<void> {
    if (!this.manager.listServers().includes(server)) {
      throw new Error(`Unknown MCP server: ${server}`);
    }
    if (this.manager.getHealth(server) === "healthy") return;
    try {
      await this.manager.startServer(server);
      await this.recordConnection(context, "connected", sessionId, traceId);
    } catch (error) {
      await this.recordConnection(context, "failed", sessionId, traceId);
      throw error;
    }
  }

  private async resolveToolForCall(
    input: RuntimeMcpToolCallRequest,
    span: ActiveRuntimeMcpSpan,
  ): Promise<DiscoveredMcpTool | RuntimeMcpCallFailure> {
    try {
      const raw = await this.manager.request(
        input.server,
        "tools/list",
        this.withMcpTraceMeta({}, span),
      );
      const tools = filterTools(
        extractToolsFromResult(raw),
        this.manager.getConfig(input.server)?.tools,
      ) as DiscoveredMcpTool[];
      const tool = tools.find((candidate) => candidate.name === input.tool);
      return tool ?? toolNotFoundFailure(input.server, input.tool);
    } catch (error) {
      return adapterFailure(error);
    }
  }

  private async finishFailureResult(params: {
    input: RuntimeMcpToolCallRequest;
    startedAt: number;
    policy: RuntimeMcpToolPolicyResult;
    context: McpGatewayToolContext;
    span: ActiveRuntimeMcpSpan;
    failure: RuntimeMcpCallFailure;
    audit?: boolean;
  }): Promise<RuntimeMcpToolCallResult> {
    if (params.audit ?? true) {
      await this.recordToolAudit({
        input: params.input,
        context: params.context,
        policy: params.policy,
        status: "error",
        errorMessage: params.failure.message,
      });
    }
    const spanProjection = await this.finishMcpSpan(params.span, "ERROR", {
      message: params.failure.message,
      attributes: {
        ...failureAttributes(params.failure),
        "kirakira.policy.trace_id": params.policy.traceId,
        ...(params.policy.decisionId !== undefined
          ? { "kirakira.policy.decision_id": params.policy.decisionId }
          : {}),
      },
    });
    return resultFrom(
      params.input,
      params.startedAt,
      params.policy,
      params.context,
      {
        success: false,
        isError: true,
        error: params.failure.message,
        structuredContent: failureStructuredContent(params.failure),
      },
      spanProjection,
    );
  }

  private async recordToolAudit(params: {
    input: RuntimeMcpToolCallRequest;
    context: McpGatewayToolContext;
    policy: RuntimeMcpToolPolicyResult;
    status: "success" | "error";
    result?: unknown;
    errorMessage?: string;
  }): Promise<void> {
    await this.mcpAuditBridge?.recordToolCall({
      serverId: params.input.server,
      toolName: params.input.tool,
      trustTier: params.context.trust.tier,
      ...(params.context.trust.authMode !== undefined
        ? { authMode: params.context.trust.authMode }
        : {}),
      args: isRecord(params.input.arguments) ? params.input.arguments : {},
      ...(params.result !== undefined ? { result: params.result } : {}),
      userId: this.userId,
      sessionId: params.input.runId ?? "daemon",
      traceId: params.policy.traceId,
      ...(params.policy.decisionId !== undefined ? { decisionId: params.policy.decisionId } : {}),
      status: params.status,
      ...(params.errorMessage !== undefined ? { errorMessage: params.errorMessage } : {}),
    }).catch(() => {});
  }

  async listTools(input: DaemonMcpListInput = {}): Promise<RuntimeMcpListResult> {
    const selectedServers = this.manager
      .listServers()
      .filter((server) => input.server === undefined || server === input.server);
    const servers: RuntimeMcpListResult["servers"] = [];

    for (const server of selectedServers) {
      const serverContext = this.contextFactory.serverContext(server, "tools/list");
      const span = this.startMcpSpan(serverContext.otel, {
        ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
        ...(input.traceContext !== undefined ? { traceContext: input.traceContext } : {}),
        attributes: { "kirakira.runtime.message.type": "mcp_list" },
      });
      let spanStatus: McpSpanStatusCode = "OK";
      let spanAttributes: McpSpanAttributes = {};
      let spanMessage: string | undefined;
      let health = this.manager.getHealth(server) as RuntimeMcpServerHealth;
      let error = this.manager.getLastError(server);
      let tools: RuntimeMcpToolSummary[] | undefined;

      if (input.startServers && health !== "healthy") {
        const startContext = this.contextFactory.serverContext(server, "server/start");
        const traceId = ulid();
        try {
          await this.manager.startServer(server);
          await this.recordConnection(startContext, "connected", "daemon", traceId);
          health = this.manager.getHealth(server) as RuntimeMcpServerHealth;
          error = this.manager.getLastError(server);
        } catch (startError) {
          await this.recordConnection(startContext, "failed", "daemon", traceId);
          health = this.manager.getHealth(server) as RuntimeMcpServerHealth;
          error = startError instanceof Error ? startError.message : String(startError);
          spanStatus = "ERROR";
          spanAttributes = { ...spanAttributes, "error.type": errorTypeFrom(startError) };
          spanMessage = error;
        }
      }

      if (input.includeTools && health === "healthy") {
        try {
          const rawTools = extractToolsFromResult(
            await this.manager.request(server, "tools/list", this.withMcpTraceMeta({}, span)),
          );
          const filtered = filterTools(
            rawTools,
            this.manager.getConfig(server)?.tools,
          ) as DiscoveredMcpTool[];
          tools = filtered.map((tool) =>
            projectTool(
              tool,
              this.contextFactory.toolContext(server, tool.name, "tools/list", serverContext),
            ),
          );
        } catch (listError) {
          error = listError instanceof Error ? listError.message : String(listError);
          spanStatus = "ERROR";
          spanAttributes = { ...spanAttributes, "error.type": errorTypeFrom(listError) };
          spanMessage = error;
        }
      }

      const spanProjection = await this.finishMcpSpan(span, spanStatus, {
        ...(spanMessage !== undefined ? { message: spanMessage } : {}),
        attributes: spanAttributes,
      });

      servers.push({
        name: server,
        health,
        policy: projectPolicy(serverContext.policy),
        trust: projectTrust(serverContext.trust),
        audit: projectAudit(serverContext.audit),
        otel: projectOtel(serverContext.otel, spanProjection),
        ...(tools !== undefined ? { tools, toolCount: tools.length } : {}),
        ...(error !== undefined ? { error } : {}),
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      servers,
    };
  }

  async callTool(input: DaemonMcpToolCallInput): Promise<RuntimeMcpToolCallResult> {
    const startedAt = Date.now();
    const validated = validateMcpCallInput(input);
    const requestedInput = "input" in validated ? validated.input : safeRequestedInput(input);
    const callContext = this.contextFactory.toolContext(
      requestedInput.server,
      requestedInput.tool,
      "tools/call",
    );
    const span = this.startMcpSpan(callContext.otel, {
      ...(requestedInput.traceId !== undefined ? { traceId: requestedInput.traceId } : {}),
      ...(requestedInput.traceContext !== undefined ? { traceContext: requestedInput.traceContext } : {}),
      attributes: {
        "kirakira.runtime.message.type": "mcp_call",
        ...(requestedInput.runId !== undefined ? { "kirakira.run.id": requestedInput.runId } : {}),
      },
    });
    if (!("input" in validated)) {
      return this.finishFailureResult({
        input: requestedInput,
        startedAt,
        policy: policyResultForFailure(requestedInput, validated),
        context: callContext,
        span,
        failure: validated,
        audit: false,
      });
    }
    if (!this.manager.listServers().includes(requestedInput.server)) {
      const failure = serverNotFoundFailure(requestedInput.server);
      return this.finishFailureResult({
        input: requestedInput,
        startedAt,
        policy: policyResultForFailure(requestedInput, failure),
        context: callContext,
        span,
        failure,
      });
    }
    const args = validated.args;
    const pepContext = this.pepContext(requestedInput);
    let policy: EnforcementResult;
    try {
      policy = await this.mcpPep.enforce(
        {
          mcpServer: requestedInput.server,
          server: requestedInput.server,
          serverId: requestedInput.server,
          ...(callContext.trust.issuer !== undefined ? { issuer: callContext.trust.issuer } : {}),
          toolName: requestedInput.tool,
          tool: requestedInput.tool,
          args: Object.values(args),
          env: {
            MCP_TRUST: callContext.trust.tier,
            KIRAKIRA_MCP_TRUST: callContext.trust.tier,
            KIRAKIRA_TRUST_TIER: callContext.trust.tier,
          },
        },
        pepContext,
      );
    } catch (error) {
      await this.finishMcpSpan(span, "ERROR", {
        message: error instanceof Error ? error.message : String(error),
        attributes: { "error.type": errorTypeFrom(error) },
      });
      throw error;
    }
    const policyResult = policyResultFromEnforcement(policy);
    if (!policy.allowed) {
      const errorCode = policy.decision.effect === "escalate" ? "approval_required" : "policy_denied";
      await this.recordToolAudit({
        input: requestedInput,
        context: callContext,
        policy: policyResult,
        status: "error",
        errorMessage: errorCode,
      });
      const spanProjection = await this.finishMcpSpan(span, "ERROR", {
        message: errorCode,
        attributes: {
          "error.type": errorCode,
          "kirakira.policy.trace_id": policyResult.traceId,
          ...(policyResult.decisionId !== undefined
            ? { "kirakira.policy.decision_id": policyResult.decisionId }
            : {}),
        },
      });
      return resultFrom(requestedInput, startedAt, policyResult, callContext, {
        success: false,
        isError: true,
        error: errorCode,
      }, spanProjection);
    }

    try {
      await this.ensureServerStarted(
        requestedInput.server,
        this.contextFactory.serverContext(requestedInput.server, "server/start"),
        pepContext.sessionId,
        pepContext.traceId,
      );
      const resolvedTool = await this.resolveToolForCall(requestedInput, span);
      if ("type" in resolvedTool) {
        return this.finishFailureResult({
          input: requestedInput,
          startedAt,
          policy: policyResult,
          context: callContext,
          span,
          failure: resolvedTool,
        });
      }
      const raw = await this.manager.request(
        requestedInput.server,
        "tools/call",
        this.withMcpTraceMeta({
          name: resolvedTool.name,
          arguments: args,
        }, span),
      );
      await this.recordToolAudit({
        input: requestedInput,
        context: callContext,
        policy: policyResult,
        status: "success",
        result: raw,
      });
      const projected = projectMcpResult(raw);
      const spanProjection = await this.finishMcpSpan(
        span,
        projected.isError === true ? "ERROR" : "OK",
        {
          attributes: {
            "kirakira.policy.trace_id": policyResult.traceId,
            ...(policyResult.decisionId !== undefined
              ? { "kirakira.policy.decision_id": policyResult.decisionId }
              : {}),
            ...(projected.isError === true ? { "error.type": "tool_error" } : {}),
          },
        },
      );
      return resultFrom(requestedInput, startedAt, policyResult, callContext, projected, spanProjection);
    } catch (error) {
      const failure = adapterFailure(error);
      await this.recordToolAudit({
        input: requestedInput,
        context: callContext,
        policy: policyResult,
        status: "error",
        errorMessage: failure.message,
      });
      const spanProjection = await this.finishMcpSpan(span, "ERROR", {
        message: failure.message,
        attributes: {
          ...failureAttributes(failure),
          "kirakira.policy.trace_id": policyResult.traceId,
          ...(policyResult.decisionId !== undefined
            ? { "kirakira.policy.decision_id": policyResult.decisionId }
            : {}),
        },
      });
      return resultFrom(requestedInput, startedAt, policyResult, callContext, {
        success: false,
        isError: true,
        error: failure.message,
        structuredContent: failureStructuredContent(failure),
      }, spanProjection);
    }
  }

  async close(): Promise<void> {
    await this.closeDeps();
  }
}
