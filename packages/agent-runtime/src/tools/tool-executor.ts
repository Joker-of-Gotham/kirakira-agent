import type { RunEvent } from "@kirakira/event-store";
import { ulid } from "ulid";

import type { McpClientManager } from "@kirakira/mcp-adapter";
import type { McpPep, PepContext } from "@kirakira/policy-engine";

import type { ToolResult } from "../types.js";
import type { RuntimeCapabilityScope } from "../types.js";
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
  onEvent?: (event: RunEvent) => Promise<void>;
}

export class ToolExecutor {
  constructor(
    private readonly mcpPep: McpPep,
    private readonly mcp: McpClientManager,
    private readonly options: ToolExecutorOptions,
  ) {}

  async execute(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const { server, tool } = splitToolName(toolName);
    const mcpServer = this.options.resolveServer?.(toolName) ?? server;
    const capabilityScope =
      typeof this.options.capabilityScope === "function"
        ? this.options.capabilityScope()
        : this.options.capabilityScope;
    const serverScopeApplies =
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
      return {
        success: false,
        output: "",
        error: "capability_scope_denied",
      };
    }
    const rawAction = {
      mcpServer,
      server: mcpServer,
      toolName: tool,
      tool,
      args: Object.values(args),
    };
    const ctx = resolveCtx(this.options.pepContext);
    const started: RunEvent = {
      id: ulid(),
      runId: ctx.sessionId,
      timestamp: new Date().toISOString(),
      kind: "tool.call.started",
      payload: { toolName, mcpServer, args },
    };
    await this.options.onEvent?.(started);
    const decision = await this.mcpPep.enforce(rawAction, ctx);
    if (!decision.allowed) {
      const failed: RunEvent = {
        id: ulid(),
        runId: ctx.sessionId,
        timestamp: new Date().toISOString(),
        kind: "tool.call.failed",
        payload: { toolName, reason: "policy_denied", traceId: decision.traceId },
      };
      await this.options.onEvent?.(failed);
      return {
        success: false,
        output: "",
        error: "policy_denied",
        approvalRequired: decision.decision.effect === "escalate",
      };
    }
    try {
      const result = await this.mcp.request(mcpServer, "tools/call", {
        name: tool,
        arguments: args,
      });
      const text = typeof result === "string" ? result : JSON.stringify(result);
      const completed: RunEvent = {
        id: ulid(),
        runId: ctx.sessionId,
        timestamp: new Date().toISOString(),
        kind: "tool.call.completed",
        payload: { toolName, resultPreview: text.slice(0, 2000) },
      };
      await this.options.onEvent?.(completed);
      return { success: true, output: text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const failed: RunEvent = {
        id: ulid(),
        runId: ctx.sessionId,
        timestamp: new Date().toISOString(),
        kind: "tool.call.failed",
        payload: { toolName, error: msg },
      };
      await this.options.onEvent?.(failed);
      return { success: false, output: "", error: msg };
    }
  }
}
