import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { AuditWriter } from "../obligation/audit-writer-types.js";
import type { ObligationExecutor } from "../obligation/obligation-executor.js";
import type { NormalizerResult } from "../normalizer/action-normalizer.js";
import { normalizeAction, type RawAction } from "../normalizer/action-normalizer.js";
import type { PdpClient } from "../pdp/pdp-types.js";
import { BasePep } from "./base-pep.js";
import type { PepContext } from "./pep-types.js";
import { asRecord, coerceEnv } from "./action-raw-parse.js";
import { signalize } from "./risk-signals.js";

function mcpRawFrom(rawAction: unknown, workspaceRoot: string): RawAction {
  const o = asRecord(rawAction) ?? {};
  const serverName =
    (typeof o.mcpServer === "string" && o.mcpServer.length > 0
      ? o.mcpServer
      : typeof o.server === "string" && o.server.length > 0
        ? o.server
        : undefined) ??
    (typeof o.operation === "string" ? o.operation : "unknown.mcp");

  const toolName =
    typeof o.toolName === "string" && o.toolName.length > 0
      ? o.toolName
      : typeof o.tool === "string" && o.tool.length > 0
        ? o.tool
        : "mcp.tool";

  return {
    kind: "tool.call",
    toolType: "mcp",
    toolName,
    /** MCP server identity used by {@link normalizeMcpAction}; keep distinct from MCP tool invocation method in higher layers when both are supplied. */
    operation: serverName,
    ...(typeof o.command === "string" ? { command: o.command } : {}),
    ...(Array.isArray(o.args)
      ? {
          args: (o.args as unknown[]).filter((x): x is string => typeof x === "string"),
        }
      : {}),
    ...(coerceEnv(o) !== undefined ? { env: coerceEnv(o)! } : {}),
    workspaceRoot,
  };
}

export class McpPep extends BasePep {
  constructor(pdp: PdpClient, obligationExecutor: ObligationExecutor, auditWriter: AuditWriter) {
    super(pdp, obligationExecutor, auditWriter);
  }

  protected normalize(rawAction: unknown, context: PepContext): NormalizerResult {
    return normalizeAction(mcpRawFrom(rawAction, context.workspaceRoot));
  }

  protected buildPolicyInput(
    rawAction: unknown,
    normalized: NormalizerResult,
    context: PepContext,
  ): PolicyInput {
    const raw = mcpRawFrom(rawAction, context.workspaceRoot);

    const o = asRecord(rawAction) ?? {};

    const mcp_server: NonNullable<PolicyInput["context"]>["mcp_server"] = {};
    if (typeof o.serverId === "string" && o.serverId.length > 0) mcp_server.id = o.serverId;
    if (typeof o.issuer === "string" && o.issuer.length > 0) mcp_server.issuer = o.issuer;
    const tier = coerceEnv(o)?.MCP_TRUST ?? coerceEnv(o)?.KIRAKIRA_MCP_TRUST ?? coerceEnv(o)?.KIRAKIRA_TRUST_TIER;
    if (tier !== undefined) mcp_server.trust_tier = tier;

    return {
      ...this.envelope(context),
      principal: this.principal(context),
      workspace: this.workspace(context),
      ...(Object.keys(mcp_server).length > 0 ? { context: { mcp_server } } : {}),
      action: {
        kind: "tool.call",
        tool_type: "mcp",
        tool_name: raw.toolName,
        operation: raw.operation,
        ...(raw.command !== undefined || raw.args !== undefined || raw.env !== undefined
          ? {
              raw: {
                ...(raw.command !== undefined ? { command: raw.command } : {}),
                ...(raw.args !== undefined ? { args: raw.args } : {}),
                ...(raw.env !== undefined ? { env: raw.env } : {}),
              },
            }
          : {}),
        normalized,
      },
      risk: { signals: signalize(normalized, "mcp") },
    };
  }

  protected execute(rawAction: unknown, decision: PolicyDecision): Promise<unknown> {
    void decision;
    return Promise.resolve(rawAction);
  }
}
