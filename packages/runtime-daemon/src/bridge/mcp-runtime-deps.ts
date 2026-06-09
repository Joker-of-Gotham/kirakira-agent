import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  McpServerConfig,
  ResolvedConfig,
  ResolvedRuntimeMcpServerState,
  ResolvedRuntimeProfileState,
} from "@kirakira/core";
import {
  buildMcpOtelRecorderPlan,
  createMcpOtelRecorderFromPlan,
  McpAuditBridge,
  McpClientManager,
  parseMcpConfigJson,
  type InMemoryMcpSpanExporter,
  type McpOtelRecorderPlan,
  type McpSpanExporter,
  type McpSpanRecorder,
  type OpenTelemetryApiLike,
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
  mcpAuditBridge?: McpAuditBridge | null;
  mcpSpanRecorder?: McpSpanRecorder | null;
  mcpOtelRecorderPlan?: McpOtelRecorderPlan;
  mcpOtelApi?: OpenTelemetryApiLike;
  mcpOtelExporter?: McpSpanExporter;
  mcpOtelEnv?: Record<string, string | undefined>;
  auditWriter?: AuditWriter;
}

export interface DaemonMcpDependencies {
  workspaceRoot: string;
  mcpManager: McpClientManager;
  mcpPep: McpPep;
  mcpAuditBridge?: McpAuditBridge;
  mcpSpanRecorder?: McpSpanRecorder;
  mcpOtelRecorderPlan: McpOtelRecorderPlan;
  mcpOtelExporter?: InMemoryMcpSpanExporter;
  mcpOtelRecorderError?: string;
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

export function buildDaemonMcpOtelRecorderPlan(
  options: Pick<
    DaemonMcpDependencyOptions,
    "mcpOtelEnv" | "mcpOtelRecorderPlan" | "resolvedConfig" | "runtimeProfileName"
  >,
): McpOtelRecorderPlan {
  if (options.mcpOtelRecorderPlan !== undefined) return options.mcpOtelRecorderPlan;
  return buildMcpOtelRecorderPlan({
    profile: activeRuntimeProfile(options.resolvedConfig, options.runtimeProfileName),
    ...(options.mcpOtelEnv !== undefined ? { env: options.mcpOtelEnv } : {}),
  });
}

function mcpOtelRecorderSelection(
  options: Pick<
    DaemonMcpDependencyOptions,
    | "mcpOtelApi"
    | "mcpOtelEnv"
    | "mcpOtelExporter"
    | "mcpOtelRecorderPlan"
    | "mcpSpanRecorder"
    | "resolvedConfig"
    | "runtimeProfileName"
  >,
): {
  plan: McpOtelRecorderPlan;
  recorder?: McpSpanRecorder;
  exporter?: InMemoryMcpSpanExporter;
  error?: string;
} {
  const plan = buildDaemonMcpOtelRecorderPlan(options);
  if (options.mcpSpanRecorder !== undefined) {
    return {
      plan,
      ...(options.mcpSpanRecorder === null ? {} : { recorder: options.mcpSpanRecorder }),
    };
  }
  try {
    const created = createMcpOtelRecorderFromPlan({
      plan,
      ...(options.mcpOtelApi !== undefined ? { api: options.mcpOtelApi } : {}),
      ...(options.mcpOtelExporter !== undefined ? { exporter: options.mcpOtelExporter } : {}),
    });
    return {
      plan: created.plan,
      ...(created.recorder !== undefined ? { recorder: created.recorder } : {}),
      ...(created.exporter !== undefined ? { exporter: created.exporter } : {}),
    };
  } catch (error) {
    return {
      plan,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createDaemonMcpDependencies(
  options: DaemonMcpDependencyOptions,
): DaemonMcpDependencies {
  const workspaceRoot = path.resolve(options.workspaceRoot);
  const mcpManager = options.mcpManager ?? new McpClientManager();
  const ownsMcpManager = options.mcpManager === undefined;
  const ownsDefaultPolicy = options.mcpPep === undefined;

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
  const mcpAuditBridge =
    options.mcpAuditBridge === null
      ? undefined
      : options.mcpAuditBridge ?? (ownsDefaultPolicy ? new McpAuditBridge() : undefined);
  const mcpOtel = mcpOtelRecorderSelection(options);

  return {
    workspaceRoot,
    mcpManager,
    mcpPep,
    ...(mcpAuditBridge !== undefined ? { mcpAuditBridge } : {}),
    mcpOtelRecorderPlan: mcpOtel.plan,
    ...(mcpOtel.recorder !== undefined ? { mcpSpanRecorder: mcpOtel.recorder } : {}),
    ...(mcpOtel.exporter !== undefined ? { mcpOtelExporter: mcpOtel.exporter } : {}),
    ...(mcpOtel.error !== undefined ? { mcpOtelRecorderError: mcpOtel.error } : {}),
    ownsMcpManager,
    async close() {
      if (ownsMcpManager) {
        await mcpManager.stopAll();
      }
      await pdp?.close();
    },
  };
}
