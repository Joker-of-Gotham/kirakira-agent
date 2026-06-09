import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  McpServerConfig,
  ResolvedConfig,
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeProfileState,
} from "@kirakira/core";
import {
  McpClientManager,
  parseMcpConfigJson,
} from "@kirakira/mcp-adapter";
import {
  EmbeddedPdp,
  LedgerAuditWriter,
  McpPep,
  ObligationExecutor,
  type AuditWriter,
} from "@kirakira/policy-engine";

export interface DaemonMcpDependencyOptions {
  workspaceRoot: string;
  mcpConfigPath?: string;
  resolvedConfig?: Pick<ResolvedConfig, "runtimeState">;
  runtimeProfileName?: string;
  policyBundlePath?: string;
  mcpManager?: McpClientManager;
  mcpPep?: McpPep;
  auditWriter?: AuditWriter;
}

export interface DaemonMcpDependencies {
  workspaceRoot: string;
  mcpManager: McpClientManager;
  mcpPep: McpPep;
  ownsMcpManager: boolean;
  close(): Promise<void>;
}

function resolveMcpConfigPath(workspaceRoot: string, configPath?: string): string {
  return path.isAbsolute(configPath ?? "")
    ? configPath!
    : path.join(workspaceRoot, configPath ?? ".mcp.json");
}

export function activeRuntimeProfile(
  resolvedConfig: Pick<ResolvedConfig, "runtimeState"> | undefined,
  runtimeProfileName: string | undefined,
): ResolvedRuntimeProfileState | undefined {
  const runtimeState = resolvedConfig?.runtimeState;
  const profiles = runtimeState?.profiles ?? [];
  const profileName = runtimeProfileName ?? runtimeState?.default_profile;
  return profiles.find((profile) => profile.name === profileName) ?? profiles[0];
}

export function mcpServerConfigFromResolved(
  server: ResolvedRuntimeMcpServerState,
): McpServerConfig {
  return {
    name: server.name,
    transport: {
      kind: "stdio",
      command: server.command,
      args: server.args ?? [],
      ...(server.env !== undefined ? { env: server.env } : {}),
    },
    auth: { mode: "none" },
    trust: "untrusted",
  };
}

export function registerMcpConfigFile(
  manager: McpClientManager,
  workspaceRoot: string,
  configPath?: string,
): void {
  const resolved = resolveMcpConfigPath(workspaceRoot, configPath);
  if (!existsSync(resolved)) return;
  try {
    manager.registerMany(parseMcpConfigJson(readFileSync(resolved, "utf8")));
  } catch {
    // Invalid or partial MCP config should not prevent the daemon runtime from starting.
  }
}

export function registerResolvedProfileServers(
  manager: McpClientManager,
  options: Pick<DaemonMcpDependencyOptions, "resolvedConfig" | "runtimeProfileName">,
): void {
  const profile = activeRuntimeProfile(options.resolvedConfig, options.runtimeProfileName);
  for (const server of profile?.mcp_servers ?? []) {
    manager.registerServer(mcpServerConfigFromResolved(server));
  }
}

export function createDaemonMcpDependencies(
  options: DaemonMcpDependencyOptions,
): DaemonMcpDependencies {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const mcpManager = options.mcpManager ?? new McpClientManager();
  const ownsMcpManager = options.mcpManager === undefined;

  registerMcpConfigFile(mcpManager, workspaceRoot, options.mcpConfigPath);
  registerResolvedProfileServers(mcpManager, options);

  let pdp: EmbeddedPdp | null = null;
  const mcpPep =
    options.mcpPep ??
    (() => {
      pdp = new EmbeddedPdp(options.policyBundlePath ?? path.join(workspaceRoot, "policies"));
      return new McpPep(
        pdp,
        new ObligationExecutor(),
        options.auditWriter ?? new LedgerAuditWriter(),
      );
    })();

  return {
    workspaceRoot,
    mcpManager,
    mcpPep,
    ownsMcpManager,
    async close() {
      if (ownsMcpManager) {
        await mcpManager.stopAll();
      }
      await pdp?.close();
    },
  };
}
