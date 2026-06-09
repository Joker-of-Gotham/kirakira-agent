import type { ResolvedConfig } from "@kirakira/core";
import type { McpClientManager } from "@kirakira/mcp-adapter";
import {
  McpPep,
  type AuditWriter,
  type EnforcementResult,
  type PepContext,
} from "@kirakira/policy-engine";
import type {
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
  auditWriter?: AuditWriter;
  userId?: string;
}

export type DaemonMcpToolCallInput = RuntimeMcpToolCallRequest;

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
  };
}

function resultFrom(
  input: RuntimeMcpToolCallRequest,
  startedAt: number,
  policy: RuntimeMcpToolPolicyResult,
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

export class DaemonMcpRuntime {
  private readonly workspaceRoot: string;
  private readonly manager: McpClientManager;
  private readonly mcpPep: McpPep;
  private readonly closeDeps: () => Promise<void>;
  private readonly userId: string;

  constructor(options: DaemonMcpRuntimeOptions) {
    const deps = createDaemonMcpDependencies(options);
    this.workspaceRoot = deps.workspaceRoot;
    this.manager = deps.mcpManager;
    this.mcpPep = deps.mcpPep;
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
    };
  }

  private async ensureServerStarted(server: string): Promise<void> {
    if (!this.manager.listServers().includes(server)) {
      throw new Error(`Unknown MCP server: ${server}`);
    }
    if (this.manager.getHealth(server) === "healthy") return;
    await this.manager.startServer(server);
  }

  async callTool(input: DaemonMcpToolCallInput): Promise<RuntimeMcpToolCallResult> {
    const args = input.arguments ?? {};
    const startedAt = Date.now();
    const policy = await this.mcpPep.enforce(
      {
        mcpServer: input.server,
        server: input.server,
        serverId: input.server,
        toolName: input.tool,
        tool: input.tool,
        args: Object.values(args),
      },
      this.pepContext(input),
    );
    const policyResult = policyResultFromEnforcement(policy);
    if (!policy.allowed) {
      return resultFrom(input, startedAt, policyResult, {
        success: false,
        isError: true,
        error: policy.decision.effect === "escalate" ? "approval_required" : "policy_denied",
      });
    }

    try {
      await this.ensureServerStarted(input.server);
      const raw = await this.manager.request(input.server, "tools/call", {
        name: input.tool,
        arguments: args,
      });
      return resultFrom(input, startedAt, policyResult, projectMcpResult(raw));
    } catch (error) {
      return resultFrom(input, startedAt, policyResult, {
        success: false,
        isError: true,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async close(): Promise<void> {
    await this.closeDeps();
  }
}
