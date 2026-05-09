/**
 * Pre-filters MCP tool calls via {@link checkDomainPolicy} / {@link checkServerPolicy},
 * then submits a full {@link PolicyInput} to the unified PDP over IPC or embedded fallback.
 */

import { homedir } from "node:os";
import { join } from "node:path";

import type { PolicyDecision, PolicyInput } from "@kirakira/core";
import {
  EmbeddedPdp,
  IpcPdp,
  createPdpClient,
  normalizeAction,
  principalFrom,
  requestEnvelope,
  signalize,
  syntheticDecision,
  workspaceFrom,
} from "@kirakira/policy-engine";
import type {
  NormalizerResult,
  PepContext,
  PdpClient,
  RawAction,
} from "@kirakira/policy-engine";

import {
  checkDomainPolicy,
  checkServerPolicy,
  type McpPolicyConfig,
} from "./policy-filter.js";

export interface PdpBridgeOptions {
  pdpSocketPath?: string;
  fallbackToEmbedded?: boolean;
  /** Domain/server MCP policy applied before the PDP. */
  policy?: McpPolicyConfig;
  /** Roles for the requesting principal (default from KIRAKIRA_USER_ROLES env or ["developer"]). */
  roles?: string[];
}

function normalizeReasonCode(reason: string | undefined): string {
  const s = typeof reason === "string" ? reason.trim() : "";
  if (s.length === 0) return "mcp_policy_denied";
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 80)
    .replace(/^_|_$/g, "");
  return slug.length > 0 ? slug : "mcp_policy_denied";
}

export class McpPdpBridge {
  private readonly policy: McpPolicyConfig;
  private readonly options?: PdpBridgeOptions;

  constructor(options?: PdpBridgeOptions) {
    this.options = options;
    this.policy = options?.policy ?? {};
  }

  private pepContext(params: {
    userId: string;
    sessionId: string;
    traceId: string;
    workspaceRoot: string;
    interactive: boolean;
  }): PepContext {
    return {
      userId: params.userId,
      sessionId: params.sessionId,
      traceId: params.traceId,
      workspaceRoot: params.workspaceRoot,
      interactive: params.interactive,
      roles: this.options?.roles
        ?? (process.env.KIRAKIRA_USER_ROLES ? process.env.KIRAKIRA_USER_ROLES.split(",").map(r => r.trim()).filter(Boolean) : ["developer"]),
    };
  }

  private async resolvePdpClient(): Promise<PdpClient | null> {
    if (this.options?.fallbackToEmbedded === false) {
      const ipc = new IpcPdp(this.options?.pdpSocketPath);
      try {
        await ipc.health();
        return ipc;
      } catch {
        return null;
      }
    }
    return createPdpClient({
      ...(this.options?.pdpSocketPath
        ? { socketPath: this.options.pdpSocketPath }
        : {}),
    });
  }

  private buildPolicyInput(
    params: {
      serverName: string;
      serverUrl?: string;
      toolName: string;
      toolArgs?: Record<string, unknown>;
      trustTier: string;
      userId: string;
      sessionId: string;
      traceId: string;
      workspaceRoot: string;
      interactive: boolean;
    },
    normalized: NormalizerResult,
  ): PolicyInput {
    const ctx = this.pepContext({
      userId: params.userId,
      sessionId: params.sessionId,
      traceId: params.traceId,
      workspaceRoot: params.workspaceRoot,
      interactive: params.interactive,
    });

    const envelope = requestEnvelope(ctx);
    const principal = principalFrom(ctx);
    const workspace = workspaceFrom(ctx);

    let issuer: string | undefined;
    if (typeof params.serverUrl === "string" && params.serverUrl.length > 0) {
      try {
        issuer = new URL(params.serverUrl).hostname;
      } catch {
        issuer = undefined;
      }
    }

    const mcp_server: NonNullable<PolicyInput["context"]>["mcp_server"] = {
      id: params.serverName,
      ...(issuer !== undefined ? { issuer } : {}),
      trust_tier: params.trustTier,
    };

    const argStrings =
      params.toolArgs !== undefined ? [JSON.stringify(params.toolArgs)] : undefined;

    return {
      ...envelope,
      principal,
      workspace,
      context: { mcp_server },
      action: {
        kind: "tool.call",
        tool_type: "mcp",
        tool_name: params.toolName,
        operation: params.serverName,
        ...(argStrings !== undefined ? { raw: { args: argStrings } } : {}),
        normalized,
      },
      risk: { signals: signalize(normalized, "mcp") },
    };
  }

  async evaluateToolCall(params: {
    serverName: string;
    serverUrl?: string;
    toolName: string;
    toolArgs?: Record<string, unknown>;
    trustTier: string;
    userId: string;
    sessionId: string;
    traceId: string;
    workspaceRoot: string;
    interactive: boolean;
  }): Promise<PolicyDecision> {
    if (
      typeof params.serverUrl === "string" &&
      params.serverUrl.length > 0
    ) {
      const domainOk = checkDomainPolicy(params.serverUrl, this.policy);
      if (!domainOk.allowed) {
        return syntheticDecision({
          requestId: params.traceId,
          effect: "deny",
          reason_codes: [`mcp_domain_${normalizeReasonCode(domainOk.reason)}`],
          summary: domainOk.reason ?? "MCP URL rejected by domain policy",
        });
      }
    }

    const serverOk = checkServerPolicy(params.serverName, this.policy);
    if (!serverOk.allowed) {
      return syntheticDecision({
        requestId: params.traceId,
        effect: "deny",
        reason_codes: [`mcp_server_${normalizeReasonCode(serverOk.reason)}`],
        summary: serverOk.reason ?? "MCP server rejected by policy",
      });
    }

    const rawAction: RawAction = {
      kind: "tool.call",
      toolType: "mcp",
      toolName: params.toolName,
      operation: params.serverName,
      workspaceRoot: params.workspaceRoot,
      env: { KIRAKIRA_TRUST_TIER: params.trustTier },
    };
    const normalized = normalizeAction(rawAction);
    if (normalized.blocked === true) {
      return syntheticDecision({
        requestId: params.traceId,
        effect: "deny",
        reason_codes: ["mcp_normalized_blocked"],
        summary: normalized.block_reason ?? "MCP normalization blocked action",
      });
    }

    const input = this.buildPolicyInput(params, normalized);

    const client = await this.resolvePdpClient();
    if (client === null) {
      return syntheticDecision({
        requestId: input.request_id,
        effect: "deny",
        reason_codes: ["pdp_unavailable"],
        summary:
          "Unified PDP IPC is unavailable (embedded fallback disabled for this adapter).",
      });
    }

    try {
      return await client.evaluate(input);
    } catch {
      /*
       * ipc-only callers already disabled embedded; remaining path is ipc+embedded
       * factory — tolerate evaluate failures by aligning with baseline embedded fail-closed
       */
      if (this.options?.fallbackToEmbedded === false) {
        return syntheticDecision({
          requestId: input.request_id,
          effect: "deny",
          reason_codes: ["pdp_evaluate_failed"],
          summary: "PDP evaluate failed over IPC.",
        });
      }

      try {
        const embedded = new EmbeddedPdp(
          join(homedir(), ".kirakira", "policy.bundle.json").replace(/\\/g, "/"),
        );
        return await embedded.evaluate(input);
      } catch {
        return syntheticDecision({
          requestId: input.request_id,
          effect: "deny",
          reason_codes: ["pdp_evaluate_failed"],
          summary: "PDP evaluate failed.",
        });
      }
    }
  }
}
