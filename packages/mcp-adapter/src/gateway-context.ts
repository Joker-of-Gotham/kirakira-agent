import type {
  McpAuthMode,
  McpServerConfig,
  McpTransportKind,
  McpTrustLevel,
} from "@kirakira/core";

import type { McpClientManager } from "./client.js";
import {
  checkObligations,
  evaluateToolPolicy,
  type ObligationConfig,
  type ToolPolicyDecision,
  type ToolPolicyRule,
} from "./gateway.js";
import { McpTrustEvaluator, type McpTrustTier } from "./trust-evaluator.js";

export type McpGatewayOperation = "tools/list" | "tools/call" | "server/start";

export type McpGatewayTrustSource =
  | "config"
  | "registry"
  | "transport"
  | "first-use"
  | "unknown";

export type McpGatewayPolicyDecision = ToolPolicyDecision | "not_evaluated";

export type McpGatewayPolicySource =
  | "gateway-rule"
  | "gateway-default"
  | "pep"
  | "not-evaluated";

export interface McpGatewayTrustContext {
  tier: McpTrustTier;
  source: McpGatewayTrustSource;
  trustedAnnotations: boolean;
  firstUse: boolean;
  configuredLevel?: McpTrustLevel;
  transportKind?: McpTransportKind;
  authMode?: McpAuthMode;
  serverUrl?: string;
  issuer?: string;
}

export interface McpGatewayPolicyContext {
  decision: McpGatewayPolicyDecision;
  source: McpGatewayPolicySource;
  reasonCodes: string[];
  approvalRequired: boolean;
  obligations: {
    snapshotRequired: boolean;
    dryRunRequired: boolean;
    auditRequired: boolean;
  };
  traceId?: string;
  decisionId?: string;
}

export interface McpGatewayAuditContext {
  auditRequired: boolean;
  eventKinds: string[];
  ledger: "pep" | "mcp-audit-bridge" | "none";
  decisionId?: string;
}

export interface McpGatewayOtelContext {
  spanName: string;
  attributes: Record<string, string | number | boolean>;
}

export interface McpGatewayServerContext {
  server: string;
  operation: McpGatewayOperation;
  trust: McpGatewayTrustContext;
  policy: McpGatewayPolicyContext;
  audit: McpGatewayAuditContext;
  otel: McpGatewayOtelContext;
}

export interface McpGatewayToolContext extends McpGatewayServerContext {
  tool: string;
  qualifiedName: string;
}

export interface McpGatewayContextFactoryOptions {
  manager: McpClientManager;
  toolPolicy?: ToolPolicyRule;
  obligations?: ObligationConfig;
}

function serverUrlFromConfig(config: McpServerConfig | undefined): string | undefined {
  if (config?.transport.kind === "http" || config?.transport.kind === "sse_legacy") {
    return config.transport.url;
  }
  return undefined;
}

function issuerFromUrl(url: string | undefined): string | undefined {
  if (url === undefined || url.length === 0) return undefined;
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

function trustTierFromConfig(level: McpTrustLevel | undefined): McpTrustTier | undefined {
  if (level === "internal-signed" || level === "enterprise-allow") return "trusted";
  if (level === "user-approved") return "verified";
  return undefined;
}

function approvedServersFromManager(manager: McpClientManager): string[] {
  return manager
    .listServers()
    .filter((name) => trustTierFromConfig(manager.getConfig(name)?.trust) !== undefined);
}

function hasPolicyRules(rules: ToolPolicyRule): boolean {
  return Boolean(rules.allow?.length || rules.ask?.length || rules.deny?.length);
}

export function qualifiedMcpToolName(server: string, tool: string): string {
  return `mcp.${server}.${tool}`;
}

export class McpGatewayContextFactory {
  private readonly manager: McpClientManager;
  private readonly toolPolicy: ToolPolicyRule;
  private readonly obligations: ObligationConfig;
  private readonly trustEvaluator: McpTrustEvaluator;

  constructor(options: McpGatewayContextFactoryOptions) {
    this.manager = options.manager;
    this.toolPolicy = options.toolPolicy ?? {};
    this.obligations = options.obligations ?? {};
    this.trustEvaluator = new McpTrustEvaluator(approvedServersFromManager(options.manager));
  }

  private trustContext(serverName: string): McpGatewayTrustContext {
    const config = this.manager.getConfig(serverName);
    const serverUrl = serverUrlFromConfig(config);
    const issuer = issuerFromUrl(serverUrl);
    const configuredTier = trustTierFromConfig(config?.trust);
    const firstUse = this.trustEvaluator.isFirstUse(serverName);

    if (configuredTier !== undefined) {
      this.trustEvaluator.markSeen(serverName);
      return {
        tier: configuredTier,
        source: "config",
        trustedAnnotations: true,
        firstUse,
        ...(config?.trust !== undefined ? { configuredLevel: config.trust } : {}),
        ...(config?.transport.kind !== undefined ? { transportKind: config.transport.kind } : {}),
        ...(config?.auth.mode !== undefined ? { authMode: config.auth.mode } : {}),
        ...(serverUrl !== undefined ? { serverUrl } : {}),
        ...(issuer !== undefined ? { issuer } : {}),
      };
    }

    const tier = this.trustEvaluator.evaluate(serverName, serverUrl);
    const source: McpGatewayTrustSource =
      this.trustEvaluator.getTrustRecord(serverName) !== undefined
        ? "registry"
        : serverUrl !== undefined && issuer !== undefined && serverUrl.startsWith("https:")
          ? "transport"
          : firstUse
            ? "first-use"
            : "unknown";
    this.trustEvaluator.markSeen(serverName);
    return {
      tier,
      source,
      trustedAnnotations: tier === "trusted" || tier === "verified",
      firstUse,
      ...(config?.trust !== undefined ? { configuredLevel: config.trust } : {}),
      ...(config?.transport.kind !== undefined ? { transportKind: config.transport.kind } : {}),
      ...(config?.auth.mode !== undefined ? { authMode: config.auth.mode } : {}),
      ...(serverUrl !== undefined ? { serverUrl } : {}),
      ...(issuer !== undefined ? { issuer } : {}),
    };
  }

  private serverPolicyContext(): McpGatewayPolicyContext {
    return {
      decision: "not_evaluated",
      source: "not-evaluated",
      reasonCodes: [],
      approvalRequired: false,
      obligations: {
        snapshotRequired: false,
        dryRunRequired: false,
        auditRequired: false,
      },
    };
  }

  private toolPolicyContext(qualifiedName: string): McpGatewayPolicyContext {
    const decision = evaluateToolPolicy(qualifiedName, this.toolPolicy);
    const obligations = checkObligations(qualifiedName, this.obligations);
    return {
      decision,
      source: hasPolicyRules(this.toolPolicy) ? "gateway-rule" : "gateway-default",
      reasonCodes: [
        hasPolicyRules(this.toolPolicy)
          ? `mcp_gateway_${decision}`
          : `mcp_gateway_default_${decision}`,
      ],
      approvalRequired: decision === "ask",
      obligations,
    };
  }

  private auditContext(
    operation: McpGatewayOperation,
    policy: McpGatewayPolicyContext,
  ): McpGatewayAuditContext {
    if (operation === "tools/call") {
      return {
        auditRequired: true,
        eventKinds: ["policy.decision", "tool.exec", "tool.result"],
        ledger: "mcp-audit-bridge",
        ...(policy.decisionId !== undefined ? { decisionId: policy.decisionId } : {}),
      };
    }
    if (operation === "server/start") {
      return {
        auditRequired: true,
        eventKinds: ["mcp.connection"],
        ledger: "mcp-audit-bridge",
      };
    }
    return {
      auditRequired: false,
      eventKinds: ["mcp.discovery"],
      ledger: "none",
    };
  }

  private otelContext(
    serverName: string,
    operation: McpGatewayOperation,
    trust: McpGatewayTrustContext,
    toolName?: string,
  ): McpGatewayOtelContext {
    return {
      spanName: toolName === undefined ? `mcp.${operation}` : `mcp.${operation}.${toolName}`,
      attributes: {
        "mcp.server.name": serverName,
        "mcp.operation": operation,
        "mcp.trust.tier": trust.tier,
        "mcp.trust.source": trust.source,
        "mcp.annotations.trusted": trust.trustedAnnotations,
        ...(trust.transportKind !== undefined ? { "mcp.transport": trust.transportKind } : {}),
        ...(trust.authMode !== undefined ? { "mcp.auth.mode": trust.authMode } : {}),
        ...(toolName !== undefined ? { "mcp.tool.name": toolName } : {}),
        "gen_ai.operation.name": operation === "tools/call" ? "tool.call" : "tool.discovery",
      },
    };
  }

  serverContext(
    serverName: string,
    operation: McpGatewayOperation = "tools/list",
  ): McpGatewayServerContext {
    const trust = this.trustContext(serverName);
    const policy = this.serverPolicyContext();
    return {
      server: serverName,
      operation,
      trust,
      policy,
      audit: this.auditContext(operation, policy),
      otel: this.otelContext(serverName, operation, trust),
    };
  }

  toolContext(
    serverName: string,
    toolName: string,
    operation: McpGatewayOperation = "tools/call",
    serverContext?: McpGatewayServerContext,
  ): McpGatewayToolContext {
    const base = serverContext ?? this.serverContext(serverName, operation);
    const qualifiedName = qualifiedMcpToolName(serverName, toolName);
    const policy = this.toolPolicyContext(qualifiedName);
    return {
      ...base,
      operation,
      tool: toolName,
      qualifiedName,
      policy,
      audit: this.auditContext(operation, policy),
      otel: this.otelContext(serverName, operation, base.trust, toolName),
    };
  }
}
