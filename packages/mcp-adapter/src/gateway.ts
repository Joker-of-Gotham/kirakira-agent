/**
 * MCP Gateway — unified tool alias layer, policy enforcement, and audit.
 *
 * Sits between the Agent and individual MCP servers:
 *   Agent → Gateway.callTool("fs.read_text", args)
 *     → alias resolve → policy check → server.tools/call → audit → result
 */

import type { McpToolInfo } from "@kirakira/core";
import type { McpClientManager } from "./client.js";
import type { McpAuditBridge } from "./audit-bridge.js";
import {
  createToolAliasCatalog,
  type ToolAlias,
  type ToolAliasCatalogInput,
} from "./alias-catalog.js";
import { filterTools } from "./tool-filter.js";
import { withTimeout } from "./timeout.js";

export {
  DEFAULT_TOOL_ALIASES,
  createToolAliasCatalog,
  mergeToolAliases,
  type ToolAlias,
  type ToolAliasCatalog,
  type ToolAliasCatalogInput,
  type ToolAliasCatalogOptions,
  type ToolAliasRiskLevel,
} from "./alias-catalog.js";

/* ------------------------------------------------------------------ */
/*  Tool alias registry                                                */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Policy decisions                                                   */
/* ------------------------------------------------------------------ */

export type ToolPolicyDecision = "allow" | "ask" | "deny";

export interface ToolPolicyRule {
  allow?: string[];
  ask?: string[];
  deny?: string[];
}

function matchToolPattern(qualifiedName: string, pattern: string): boolean {
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    return qualifiedName.startsWith(prefix);
  }
  return qualifiedName === pattern;
}

export function evaluateToolPolicy(
  qualifiedName: string,
  rules: ToolPolicyRule,
): ToolPolicyDecision {
  if (rules.deny?.some((p) => matchToolPattern(qualifiedName, p))) {
    return "deny";
  }
  if (rules.ask?.some((p) => matchToolPattern(qualifiedName, p))) {
    return "ask";
  }
  if (rules.allow?.some((p) => matchToolPattern(qualifiedName, p))) {
    return "allow";
  }
  return "ask";
}

/* ------------------------------------------------------------------ */
/*  Obligation checks                                                  */
/* ------------------------------------------------------------------ */

export interface ObligationConfig {
  snapshot_required?: string[];
  dry_run_required?: string[];
  audit_required?: string[];
}

function matchAnyPattern(qualifiedName: string, patterns?: string[]): boolean {
  return patterns?.some((p) => matchToolPattern(qualifiedName, p)) ?? false;
}

export function checkObligations(
  qualifiedName: string,
  obligations: ObligationConfig,
): { snapshotRequired: boolean; dryRunRequired: boolean; auditRequired: boolean } {
  return {
    snapshotRequired: matchAnyPattern(qualifiedName, obligations.snapshot_required),
    dryRunRequired: matchAnyPattern(qualifiedName, obligations.dry_run_required),
    auditRequired: matchAnyPattern(qualifiedName, obligations.audit_required),
  };
}

/* ------------------------------------------------------------------ */
/*  Gateway tool descriptor (what the Agent model sees)                */
/* ------------------------------------------------------------------ */

export interface GatewayTool {
  alias: string;
  server: string;
  nativeTool: string;
  qualifiedName: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  readOnly: boolean;
  inputSchema?: Record<string, unknown>;
  policyDecision: ToolPolicyDecision;
}

/* ------------------------------------------------------------------ */
/*  Gateway call result                                                */
/* ------------------------------------------------------------------ */

export interface GatewayCallResult {
  alias: string;
  server: string;
  nativeTool: string;
  content: unknown;
  policyDecision: ToolPolicyDecision;
  obligations: { snapshotRequired: boolean; dryRunRequired: boolean; auditRequired: boolean };
  latencyMs: number;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  McpGateway                                                         */
/* ------------------------------------------------------------------ */

export interface McpGatewayOptions {
  manager: McpClientManager;
  aliasCatalog?: ToolAliasCatalogInput;
  toolPolicy?: ToolPolicyRule;
  obligations?: ObligationConfig;
  auditBridge?: McpAuditBridge;
  sessionId?: string;
  traceId?: string;
  userId?: string;
}

export class McpGateway {
  private readonly manager: McpClientManager;
  private readonly toolPolicy: ToolPolicyRule;
  private readonly obligations: ObligationConfig;
  private readonly auditBridge?: McpAuditBridge;
  private readonly sessionId: string;
  private readonly traceId: string;
  private readonly userId: string;

  private readonly aliasMap = new Map<string, ToolAlias>();
  private readonly serverToolCache = new Map<string, McpToolInfo[]>();
  private discoveredTools: GatewayTool[] = [];

  constructor(options: McpGatewayOptions) {
    this.manager = options.manager;
    this.toolPolicy = options.toolPolicy ?? {};
    this.obligations = options.obligations ?? {};
    this.auditBridge = options.auditBridge;
    this.sessionId = options.sessionId ?? "unknown";
    this.traceId = options.traceId ?? "unknown";
    this.userId = options.userId ?? "local";

    for (const alias of createToolAliasCatalog(options.aliasCatalog).aliases) {
      this.aliasMap.set(alias.alias, alias);
    }
  }

  /** Register a custom tool alias (extends or overrides built-in aliases). */
  registerAlias(alias: ToolAlias): void {
    this.aliasMap.set(alias.alias, alias);
  }

  /** Register custom tool aliases (extends or overrides the active catalog). */
  registerAliases(aliases: readonly ToolAlias[]): void {
    for (const alias of aliases) {
      this.registerAlias(alias);
    }
  }

  /** Start all registered MCP servers and discover their tools. */
  async startAll(): Promise<void> {
    const serverNames = this.manager.listServers();
    const errors: string[] = [];

    await Promise.all(serverNames.map(async (name) => {
      try {
        await this.manager.startServer(name);
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }));

    await this.refreshToolCache();

    if (errors.length > 0 && this.discoveredTools.length === 0) {
      throw new Error(`Failed to start any MCP server:\n${errors.join("\n")}`);
    }
  }

  /** Re-query tools/list from all running servers and rebuild the discovered tool set. */
  async refreshToolCache(): Promise<void> {
    this.serverToolCache.clear();
    this.discoveredTools = [];

    const serverNames = this.manager.listServers();

    for (const name of serverNames) {
      if (this.manager.getHealth(name) !== "healthy") continue;

      try {
        const raw = await withTimeout(
          this.manager.request(name, "tools/list", {}),
          30_000,
          `tools/list:${name}`,
        );
        const tools = extractToolsFromResult(raw);
        const cfg = this.manager.getConfig(name);
        const filtered = filterTools(tools, cfg?.tools);
        this.serverToolCache.set(name, filtered);
      } catch {
        this.serverToolCache.set(name, []);
      }
    }

    this.buildDiscoveredTools();
  }

  private buildDiscoveredTools(): void {
    this.discoveredTools = [];

    for (const [_alias, aliasDef] of this.aliasMap) {
      const serverTools = this.serverToolCache.get(aliasDef.server);
      if (!serverTools) continue;

      const nativeTool = serverTools.find((t) => t.name === aliasDef.tool);
      if (!nativeTool) continue;

      const qualifiedName = `mcp.${aliasDef.server}.${aliasDef.tool}`;
      const decision = evaluateToolPolicy(qualifiedName, this.toolPolicy);

      if (decision === "deny") continue;

      this.discoveredTools.push({
        alias: aliasDef.alias,
        server: aliasDef.server,
        nativeTool: aliasDef.tool,
        qualifiedName,
        description: aliasDef.description ?? nativeTool.description ?? "",
        riskLevel: aliasDef.riskLevel,
        readOnly: aliasDef.readOnly,
        inputSchema: nativeTool.inputSchema,
        policyDecision: decision,
      });
    }

    for (const [serverName, tools] of this.serverToolCache) {
      for (const tool of tools) {
        const alreadyMapped = this.discoveredTools.some(
          (d) => d.server === serverName && d.nativeTool === tool.name,
        );
        if (alreadyMapped) continue;

        const qualifiedName = `mcp.${serverName}.${tool.name}`;
        const decision = evaluateToolPolicy(qualifiedName, this.toolPolicy);
        if (decision === "deny") continue;

        this.discoveredTools.push({
          alias: `mcp.${serverName}.${tool.name}`,
          server: serverName,
          nativeTool: tool.name,
          qualifiedName,
          description: tool.description ?? "",
          riskLevel: "medium",
          readOnly: false,
          inputSchema: tool.inputSchema,
          policyDecision: decision,
        });
      }
    }
  }

  /** Get all available tools for the Agent model. */
  getTools(): readonly GatewayTool[] {
    return this.discoveredTools;
  }

  /** Resolve an alias or qualified name to its GatewayTool descriptor. */
  resolveTool(nameOrAlias: string): GatewayTool | undefined {
    return this.discoveredTools.find(
      (t) => t.alias === nameOrAlias || t.qualifiedName === nameOrAlias,
    );
  }

  /** Call a tool by alias or qualified name. */
  async callTool(
    nameOrAlias: string,
    args: Record<string, unknown>,
  ): Promise<GatewayCallResult> {
    const tool = this.resolveTool(nameOrAlias);
    if (!tool) {
      return {
        alias: nameOrAlias,
        server: "unknown",
        nativeTool: nameOrAlias,
        content: null,
        policyDecision: "deny",
        obligations: { snapshotRequired: false, dryRunRequired: false, auditRequired: false },
        latencyMs: 0,
        error: `Tool not found: ${nameOrAlias}`,
      };
    }

    const obl = checkObligations(tool.qualifiedName, this.obligations);

    const t0 = Date.now();

    try {
      const raw = await this.manager.request(tool.server, "tools/call", {
        name: tool.nativeTool,
        arguments: args,
      });

      const latencyMs = Date.now() - t0;

      if (this.auditBridge && obl.auditRequired) {
        await this.auditBridge.recordToolCall({
          serverId: tool.server,
          toolName: tool.nativeTool,
          trustTier: "user-approved",
          args,
          result: raw,
          userId: this.userId,
          sessionId: this.sessionId,
          traceId: this.traceId,
          status: "success",
        }).catch(() => {});
      }

      return {
        alias: tool.alias,
        server: tool.server,
        nativeTool: tool.nativeTool,
        content: raw,
        policyDecision: tool.policyDecision,
        obligations: obl,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - t0;
      const errorMsg = err instanceof Error ? err.message : String(err);

      if (this.auditBridge && obl.auditRequired) {
        await this.auditBridge.recordToolCall({
          serverId: tool.server,
          toolName: tool.nativeTool,
          trustTier: "user-approved",
          args,
          userId: this.userId,
          sessionId: this.sessionId,
          traceId: this.traceId,
          status: "error",
          errorMessage: errorMsg,
        }).catch(() => {});
      }

      return {
        alias: tool.alias,
        server: tool.server,
        nativeTool: tool.nativeTool,
        content: null,
        policyDecision: tool.policyDecision,
        obligations: obl,
        latencyMs,
        error: errorMsg,
      };
    }
  }

  /** Stop all MCP servers. */
  async stopAll(): Promise<void> {
    await this.manager.stopAll();
  }

  /** Get summary of gateway state for TUI display. */
  getSummary(): {
    servers: Array<{ name: string; health: string; toolCount: number; error?: string }>;
    totalTools: number;
    aliases: number;
  } {
    const serverNames = this.manager.listServers();
    const servers = serverNames.map((name) => {
      const error = this.manager.getLastError(name);
      return {
        name,
        health: this.manager.getHealth(name),
        toolCount: this.serverToolCache.get(name)?.length ?? 0,
        ...(error !== undefined ? { error } : {}),
      };
    });

    return {
      servers,
      totalTools: this.discoveredTools.length,
      aliases: this.aliasMap.size,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function extractToolsFromResult(result: unknown): McpToolInfo[] {
  if (typeof result !== "object" || result === null) return [];
  const r = result as Record<string, unknown>;
  if (Array.isArray(r.tools)) return r.tools as McpToolInfo[];
  return [];
}
