import type { ResolvedConfig } from "@kirakira/core";
import {
  McpGatewayContextFactory,
  mcpMetaFromSpanContext,
  filterTools,
  type McpAuditBridge,
  type McpClientManager,
  type McpGatewayAuditContext,
  type McpGatewayOtelContext,
  type McpGatewayPolicyContext,
  type McpGatewayServerContext,
  type McpGatewayToolContext,
  type McpSpanAttributes,
  type McpSpanHandle,
  type McpSpanRecorder,
  type McpSpanStatusCode,
  type McpGatewayTrustContext,
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
  auditWriter?: AuditWriter;
  userId?: string;
}

export type DaemonMcpToolCallInput = RuntimeMcpToolCallRequest;
export type DaemonMcpListInput = RuntimeMcpListRequest;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function errorTypeFrom(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return "error";
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
  status?: RuntimeMcpOtelSpanStatus;
  durationMs?: number;
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
  "success" | "content" | "structuredContent" | "isError"
> {
  if (!isRecord(raw)) {
    return {
      success: true,
      content: raw,
    };
  }
  const isError = typeof raw.isError === "boolean" ? raw.isError : undefined;
  return {
    success: isError !== true,
    ...(raw.content !== undefined ? { content: raw.content } : {}),
    ...(isRecord(raw.structuredContent)
      ? { structuredContent: raw.structuredContent }
      : {}),
    ...(isError !== undefined ? { isError } : {}),
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
    attributes: context.attributes,
    ...(span?.traceId !== undefined ? { traceId: span.traceId } : {}),
    ...(span?.spanId !== undefined ? { spanId: span.spanId } : {}),
    ...(span?.parentSpanId !== undefined ? { parentSpanId: span.parentSpanId } : {}),
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
    this.mcpSpanRecorder =
      options.mcpSpanRecorder === null ? undefined : options.mcpSpanRecorder;
    this.contextFactory = new McpGatewayContextFactory({ manager: this.manager });
    this.closeDeps = deps.close;
    this.userId = options.userId ?? process.env.USERNAME ?? process.env.USER ?? "local-user";
  }

  private startMcpSpan(
    context: McpGatewayOtelContext,
    options: {
      traceId?: string;
      attributes?: McpSpanAttributes;
    } = {},
  ): ActiveRuntimeMcpSpan {
    const startedAt = Date.now();
    if (this.mcpSpanRecorder === undefined) return { startedAt };

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
      });
      return { startedAt, handle };
    } catch {
      return { startedAt };
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

    return {
      ...(span.handle?.context.traceId !== undefined ? { traceId: span.handle.context.traceId } : {}),
      ...(span.handle?.context.spanId !== undefined ? { spanId: span.handle.context.spanId } : {}),
      ...(span.handle?.context.parentSpanId !== undefined
        ? { parentSpanId: span.handle.context.parentSpanId }
        : {}),
      status,
      durationMs: Math.max(0, endTimeUnixMs - span.startedAt),
    };
  }

  private withMcpTraceMeta<T extends Record<string, unknown>>(
    params: T,
    span: ActiveRuntimeMcpSpan,
  ): T {
    if (span.handle === undefined) return params;
    const traceMeta = mcpMetaFromSpanContext(span.handle.context);
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
      args: params.input.arguments ?? {},
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
    const args = input.arguments ?? {};
    const startedAt = Date.now();
    const callContext = this.contextFactory.toolContext(input.server, input.tool, "tools/call");
    const span = this.startMcpSpan(callContext.otel, {
      ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
      attributes: {
        "kirakira.runtime.message.type": "mcp_call",
        ...(input.runId !== undefined ? { "kirakira.run.id": input.runId } : {}),
      },
    });
    const pepContext = this.pepContext(input);
    let policy: EnforcementResult;
    try {
      policy = await this.mcpPep.enforce(
        {
          mcpServer: input.server,
          server: input.server,
          serverId: input.server,
          ...(callContext.trust.issuer !== undefined ? { issuer: callContext.trust.issuer } : {}),
          toolName: input.tool,
          tool: input.tool,
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
        input,
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
      return resultFrom(input, startedAt, policyResult, callContext, {
        success: false,
        isError: true,
        error: errorCode,
      }, spanProjection);
    }

    try {
      await this.ensureServerStarted(
        input.server,
        this.contextFactory.serverContext(input.server, "server/start"),
        pepContext.sessionId,
        pepContext.traceId,
      );
      const raw = await this.manager.request(
        input.server,
        "tools/call",
        this.withMcpTraceMeta({
          name: input.tool,
          arguments: args,
        }, span),
      );
      await this.recordToolAudit({
        input,
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
      return resultFrom(input, startedAt, policyResult, callContext, projected, spanProjection);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordToolAudit({
        input,
        context: callContext,
        policy: policyResult,
        status: "error",
        errorMessage,
      });
      const spanProjection = await this.finishMcpSpan(span, "ERROR", {
        message: errorMessage,
        attributes: {
          "error.type": errorTypeFrom(error),
          "kirakira.policy.trace_id": policyResult.traceId,
          ...(policyResult.decisionId !== undefined
            ? { "kirakira.policy.decision_id": policyResult.decisionId }
            : {}),
        },
      });
      return resultFrom(input, startedAt, policyResult, callContext, {
        success: false,
        isError: true,
        error: errorMessage,
      }, spanProjection);
    }
  }

  async close(): Promise<void> {
    await this.closeDeps();
  }
}
