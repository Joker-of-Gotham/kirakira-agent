import type { ResolvedConfig } from "@kirakira/core";
import {
  McpGatewayContextFactory,
  filterTools,
  type McpAuditBridge,
  type McpClientManager,
  type McpGatewayAuditContext,
  type McpGatewayOtelContext,
  type McpGatewayPolicyContext,
  type McpGatewayServerContext,
  type McpGatewayToolContext,
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
  auditWriter?: AuditWriter;
  userId?: string;
}

export type DaemonMcpToolCallInput = RuntimeMcpToolCallRequest;
export type DaemonMcpListInput = RuntimeMcpListRequest;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

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

function resultFrom(
  input: RuntimeMcpToolCallRequest,
  startedAt: number,
  policy: RuntimeMcpToolPolicyResult,
  context: McpGatewayToolContext,
  overrides: Partial<Omit<RuntimeMcpToolCallResult, "server" | "tool" | "latencyMs" | "policy">>,
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
    otel: projectOtel(context.otel),
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

function projectOtel(context: McpGatewayOtelContext): RuntimeMcpOtelMetadata {
  return {
    spanName: context.spanName,
    attributes: context.attributes,
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
  private readonly contextFactory: McpGatewayContextFactory;
  private readonly closeDeps: () => Promise<void>;
  private readonly userId: string;

  constructor(options: DaemonMcpRuntimeOptions) {
    const deps = createDaemonMcpDependencies(options);
    this.workspaceRoot = deps.workspaceRoot;
    this.manager = deps.mcpManager;
    this.mcpPep = deps.mcpPep;
    this.mcpAuditBridge = deps.mcpAuditBridge;
    this.contextFactory = new McpGatewayContextFactory({ manager: this.manager });
    this.closeDeps = deps.close;
    this.userId = options.userId ?? process.env.USERNAME ?? process.env.USER ?? "local-user";
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
        }
      }

      if (input.includeTools && health === "healthy") {
        try {
          const rawTools = extractToolsFromResult(await this.manager.request(server, "tools/list", {}));
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
        }
      }

      servers.push({
        name: server,
        health,
        policy: projectPolicy(serverContext.policy),
        trust: projectTrust(serverContext.trust),
        audit: projectAudit(serverContext.audit),
        otel: projectOtel(serverContext.otel),
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
    const pepContext = this.pepContext(input);
    const policy = await this.mcpPep.enforce(
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
    const policyResult = policyResultFromEnforcement(policy);
    if (!policy.allowed) {
      await this.recordToolAudit({
        input,
        context: callContext,
        policy: policyResult,
        status: "error",
        errorMessage: policy.decision.effect === "escalate" ? "approval_required" : "policy_denied",
      });
      return resultFrom(input, startedAt, policyResult, callContext, {
        success: false,
        isError: true,
        error: policy.decision.effect === "escalate" ? "approval_required" : "policy_denied",
      });
    }

    try {
      await this.ensureServerStarted(
        input.server,
        this.contextFactory.serverContext(input.server, "server/start"),
        pepContext.sessionId,
        pepContext.traceId,
      );
      const raw = await this.manager.request(input.server, "tools/call", {
        name: input.tool,
        arguments: args,
      });
      await this.recordToolAudit({
        input,
        context: callContext,
        policy: policyResult,
        status: "success",
        result: raw,
      });
      return resultFrom(input, startedAt, policyResult, callContext, projectMcpResult(raw));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.recordToolAudit({
        input,
        context: callContext,
        policy: policyResult,
        status: "error",
        errorMessage,
      });
      return resultFrom(input, startedAt, policyResult, callContext, {
        success: false,
        isError: true,
        error: errorMessage,
      });
    }
  }

  async close(): Promise<void> {
    await this.closeDeps();
  }
}
