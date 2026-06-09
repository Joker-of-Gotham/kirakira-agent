import type { RunEvent } from "@kirakira/event-store";
import { ulid } from "ulid";

import type { McpClientManager } from "@kirakira/mcp-adapter";
import type { EnforcementResult, McpPep, PepContext } from "@kirakira/policy-engine";

import type {
  AgentMcpOtelMetadata,
  AgentMcpToolCallRequest,
  AgentMcpToolCallResult,
  AgentMcpToolGateway,
  AgentMcpToolPolicyResult,
  McpCallToolResult,
  McpContentBlock,
  McpTraceContextCarrier,
  RuntimeCapabilityScope,
  ToolResult,
} from "../types.js";
import {
  scopeAllowsMcpServerName,
  scopeAllowsToolName,
} from "../runtime-scope.js";

function resolveCtx(ctx: PepContext | (() => PepContext)): PepContext {
  return typeof ctx === "function" ? ctx() : ctx;
}

function splitToolName(toolName: string): { server: string; tool: string } {
  const i = toolName.indexOf(":");
  if (i <= 0) return { server: "default", tool: toolName };
  return { server: toolName.slice(0, i), tool: toolName.slice(i + 1) };
}

export interface ToolExecutorOptions {
  pepContext: PepContext | (() => PepContext);
  resolveServer?: (toolName: string) => string;
  capabilityScope?: RuntimeCapabilityScope | (() => RuntimeCapabilityScope | undefined);
  runtimeProfileName?: string | (() => string | undefined);
  traceContext?: McpTraceContextCarrier | (() => McpTraceContextCarrier | undefined);
  toolGateway?: AgentMcpToolGateway;
  onEvent?: (event: RunEvent) => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isContentBlock(value: unknown): value is McpContentBlock {
  return isRecord(value) && typeof value.type === "string";
}

function isMcpCallToolResult(value: unknown): value is McpCallToolResult {
  return isRecord(value) && Array.isArray(value.content) && value.content.every(isContentBlock);
}

function optionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function textFromContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((block) => {
      if (!isRecord(block) || typeof block.text !== "string") return undefined;
      return block.text;
    })
    .filter((item): item is string => item !== undefined)
    .join("\n")
    .trim();
  return text.length > 0 ? text : undefined;
}

function renderContent(content: unknown): string {
  if (content === undefined) return "";
  const text = textFromContent(content);
  if (text !== undefined) return text;
  return safeStringify(content);
}

function renderGatewayOutput(result: AgentMcpToolCallResult): string {
  const contentText = renderContent(result.content);
  const structuredText =
    result.structuredContent === undefined ? "" : safeStringify(result.structuredContent);
  if (contentText.length > 0 && structuredText.length > 0) {
    return `${contentText}\n\nstructuredContent:\n${structuredText}`;
  }
  if (contentText.length > 0) return contentText;
  if (structuredText.length > 0) return structuredText;
  return result.error ?? "";
}

function toolErrorText(result: AgentMcpToolCallResult, output: string): string {
  if (typeof result.error === "string" && result.error.length > 0) return result.error;
  const contentText = textFromContent(result.content);
  if (contentText !== undefined) return contentText;
  if (output.length > 0) return output;
  return result.isError === true ? "MCP tool returned isError=true" : "tool_execution_failed";
}

function otelForToolCall(
  server: string,
  tool: string,
  status: AgentMcpOtelMetadata["status"] = "UNSET",
  attributes: Record<string, string | number | boolean> = {},
): AgentMcpOtelMetadata {
  return {
    spanName: `tools/call ${tool}`,
    attributes: {
      "mcp.method.name": "tools/call",
      "mcp.server.name": server,
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": tool,
      ...attributes,
    },
    status,
  };
}

function policyResultFromEnforcement(result: EnforcementResult): AgentMcpToolPolicyResult {
  return {
    effect: result.decision.effect,
    reasonCodes: result.decision.reason_codes ?? [],
    approvalRequired: result.decision.approval?.required ?? result.decision.effect === "escalate",
    traceId: result.traceId,
    ...(result.decision.decision_id !== undefined ? { decisionId: result.decision.decision_id } : {}),
    ...(result.decision.explain?.summary !== undefined
      ? { summary: result.decision.explain.summary }
      : {}),
  };
}

function projectMcpResult(raw: unknown): Pick<
  AgentMcpToolCallResult,
  "success" | "content" | "structuredContent" | "isError" | "error"
> {
  if (!isMcpCallToolResult(raw)) {
    return {
      success: true,
      content: raw,
      isError: false,
    };
  }
  const isError = raw.isError === true;
  return {
    success: !isError,
    content: raw.content,
    ...(optionalRecord(raw.structuredContent) !== undefined
      ? { structuredContent: raw.structuredContent }
      : {}),
    ...(raw.isError !== undefined ? { isError: raw.isError } : {}),
    ...(isError
      ? { error: textFromContent(raw.content) ?? "MCP tool returned isError=true" }
      : {}),
  };
}

function failureContent(message: string): McpContentBlock[] {
  return [{ type: "text", text: message }];
}

function gatewayFailureResult(
  request: AgentMcpToolCallRequest,
  startedAt: number,
  error: string,
  options: {
    policy?: AgentMcpToolPolicyResult;
    type: string;
    jsonRpcCode?: number;
  },
): AgentMcpToolCallResult {
  return {
    server: request.server,
    tool: request.tool,
    success: false,
    content: failureContent(error),
    structuredContent: {
      error: {
        type: options.type,
        ...(options.jsonRpcCode !== undefined
          ? { jsonrpc: { code: options.jsonRpcCode, message: error } }
          : {}),
      },
    },
    isError: true,
    error,
    latencyMs: Date.now() - startedAt,
    ...(options.policy !== undefined ? { policy: options.policy } : {}),
    otel: otelForToolCall(request.server, request.tool, "ERROR", {
      "error.type": options.type,
      ...(options.jsonRpcCode !== undefined
        ? { "rpc.response.status_code": String(options.jsonRpcCode) }
        : {}),
    }),
  };
}

class DirectMcpManagerToolGateway implements AgentMcpToolGateway {
  constructor(
    private readonly mcpPep: McpPep,
    private readonly mcp: McpClientManager,
    private readonly options: ToolExecutorOptions,
  ) {}

  async callTool(request: AgentMcpToolCallRequest): Promise<AgentMcpToolCallResult> {
    const startedAt = Date.now();
    const args = request.arguments ?? {};
    const rawAction = {
      mcpServer: request.server,
      server: request.server,
      serverId: request.server,
      toolName: request.tool,
      tool: request.tool,
      args: Object.values(args),
    };
    const decision = await this.mcpPep.enforce(rawAction, resolveCtx(this.options.pepContext));
    const policy = policyResultFromEnforcement(decision);
    if (!decision.allowed) {
      return gatewayFailureResult(request, startedAt, "policy_denied", {
        policy,
        type: decision.decision.effect === "escalate" ? "approval_required" : "policy_denied",
      });
    }

    try {
      const params: Record<string, unknown> = {
        name: request.tool,
        arguments: args,
      };
      if (request.traceContext !== undefined) {
        params._meta = request.traceContext;
      }
      const raw = await this.mcp.request(request.server, "tools/call", params);
      const projected = projectMcpResult(raw);
      return {
        server: request.server,
        tool: request.tool,
        ...projected,
        latencyMs: Date.now() - startedAt,
        policy,
        otel: otelForToolCall(
          request.server,
          request.tool,
          projected.isError === true ? "ERROR" : "OK",
          projected.isError === true ? { "error.type": "tool_error" } : {},
        ),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return gatewayFailureResult(request, startedAt, message, {
        policy,
        type: "adapter_error",
        jsonRpcCode: -32603,
      });
    }
  }
}

function resolveOptional<T>(value: T | (() => T | undefined) | undefined): T | undefined {
  return typeof value === "function" ? (value as () => T | undefined)() : value;
}

function localFailureResult(
  server: string,
  tool: string,
  error: string,
  type: string,
): ToolResult {
  return {
    success: false,
    output: error,
    error,
    mcp: {
      server,
      tool,
      success: false,
      content: failureContent(error),
      structuredContent: { error: { type } },
      isError: true,
      error,
      latencyMs: 0,
      otel: otelForToolCall(server, tool, "ERROR", { "error.type": type }),
    },
  };
}

function toolResultFromGateway(result: AgentMcpToolCallResult): ToolResult {
  const output = renderGatewayOutput(result);
  const success = result.success && result.isError !== true;
  return {
    success,
    output,
    ...(success ? {} : { error: toolErrorText(result, output) }),
    ...(result.policy?.approvalRequired === true ? { approvalRequired: true } : {}),
    mcp: result,
  };
}

function gatewayCallRequest(
  server: string,
  tool: string,
  args: Record<string, unknown>,
  ctx: PepContext,
  options: ToolExecutorOptions,
): AgentMcpToolCallRequest {
  const profileName = resolveOptional(options.runtimeProfileName);
  const traceContext = resolveOptional(options.traceContext);
  const requestedLane = ctx.agent?.requestedLane ?? ctx.agent?.lane;
  return {
    server,
    tool,
    arguments: args,
    runId: ctx.sessionId,
    traceId: ctx.traceId,
    ...(traceContext !== undefined ? { traceContext } : {}),
    ...(ctx.agent?.subagentId !== undefined ? { subagentId: ctx.agent.subagentId } : {}),
    ...(ctx.agent?.role !== undefined ? { role: ctx.agent.role } : {}),
    ...(requestedLane !== undefined ? { requestedLane } : {}),
    ...(profileName !== undefined ? { runtimeProfileName: profileName } : {}),
  };
}

export class ToolExecutor {
  private readonly gateway: AgentMcpToolGateway;
  private readonly options: ToolExecutorOptions;

  constructor(gateway: AgentMcpToolGateway, options: ToolExecutorOptions);
  constructor(mcpPep: McpPep, mcp: McpClientManager, options: ToolExecutorOptions);
  constructor(
    first: AgentMcpToolGateway | McpPep,
    second: ToolExecutorOptions | McpClientManager,
    third?: ToolExecutorOptions,
  ) {
    if (third === undefined) {
      this.gateway = first as AgentMcpToolGateway;
      this.options = second as ToolExecutorOptions;
      return;
    }
    this.options = third;
    this.gateway =
      third.toolGateway ??
      new DirectMcpManagerToolGateway(first as McpPep, second as McpClientManager, third);
  }

  fork(overrides: Partial<ToolExecutorOptions> = {}): ToolExecutor {
    return new ToolExecutor(this.gateway, {
      ...this.options,
      ...overrides,
    });
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const { server, tool } = splitToolName(toolName);
    const mcpServer = this.options.resolveServer?.(toolName) ?? server;
    const capabilityScope =
      typeof this.options.capabilityScope === "function"
        ? this.options.capabilityScope()
        : this.options.capabilityScope;
    const explicitMcpTool = toolName.includes(":") || mcpServer !== "default";
    const serverScopeApplies =
      explicitMcpTool &&
      capabilityScope?.mcpServers !== undefined && capabilityScope.mcpServers.length > 0;
    if (
      !scopeAllowsToolName(capabilityScope, toolName) ||
      (serverScopeApplies && !scopeAllowsMcpServerName(capabilityScope, mcpServer))
    ) {
      const ctx = resolveCtx(this.options.pepContext);
      const failed: RunEvent = {
        id: ulid(),
        runId: ctx.sessionId,
        timestamp: new Date().toISOString(),
        kind: "tool.call.failed",
        payload: { toolName, mcpServer, reason: "capability_scope_denied" },
      };
      await this.options.onEvent?.(failed);
      return localFailureResult(
        mcpServer,
        tool,
        "capability_scope_denied",
        "capability_scope_denied",
      );
    }
    const ctx = resolveCtx(this.options.pepContext);
    const started: RunEvent = {
      id: ulid(),
      runId: ctx.sessionId,
      timestamp: new Date().toISOString(),
      kind: "tool.call.started",
      payload: {
        toolName,
        mcpServer,
        nativeTool: tool,
        args,
        ...(resolveOptional(this.options.runtimeProfileName) !== undefined
          ? { runtimeProfileName: resolveOptional(this.options.runtimeProfileName) }
          : {}),
      },
    };
    await this.options.onEvent?.(started);
    try {
      const gatewayResult = await this.gateway.callTool(
        gatewayCallRequest(mcpServer, tool, args, ctx, this.options),
      );
      const result = toolResultFromGateway(gatewayResult);
      const completedKind = result.success ? "tool.call.completed" : "tool.call.failed";
      const completed: RunEvent = {
        id: ulid(),
        runId: ctx.sessionId,
        timestamp: new Date().toISOString(),
        kind: completedKind,
        payload: {
          toolName,
          mcpServer,
          nativeTool: tool,
          resultPreview: result.output.slice(0, 2000),
          isError: gatewayResult.isError === true,
          ...(result.error !== undefined ? { error: result.error } : {}),
          ...(result.approvalRequired === true ? { approvalRequired: true } : {}),
          ...(gatewayResult.policy !== undefined
            ? {
                policy: {
                  effect: gatewayResult.policy.effect,
                  traceId: gatewayResult.policy.traceId,
                  approvalRequired: gatewayResult.policy.approvalRequired,
                },
              }
            : {}),
          ...(gatewayResult.otel !== undefined
            ? {
                otel: {
                  spanName: gatewayResult.otel.spanName,
                  attributes: gatewayResult.otel.attributes,
                  status: gatewayResult.otel.status,
                },
              }
            : {}),
        },
      };
      await this.options.onEvent?.(completed);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const failed: RunEvent = {
        id: ulid(),
        runId: ctx.sessionId,
        timestamp: new Date().toISOString(),
        kind: "tool.call.failed",
        payload: { toolName, mcpServer, nativeTool: tool, error: msg },
      };
      await this.options.onEvent?.(failed);
      return localFailureResult(mcpServer, tool, msg, "gateway_error");
    }
  }
}
