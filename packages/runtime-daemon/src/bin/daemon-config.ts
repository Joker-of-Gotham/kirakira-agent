import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  parseRuntimeOriginList,
  parseRuntimePort,
} from "@kirakira/runtime-contracts";
import {
  loadConfigLayers,
  loadLocalConfig,
  loadPolicyYaml,
  resolveConfig,
} from "@kirakira/config-resolver";
import type { ResolvedConfig } from "@kirakira/core";
import type { OrchestratorKernelOptions } from "@kirakira/orchestrator-kernel/daemon-orchestrator";
import type { BrowserGatewayConfig } from "../server/browser-gateway-server.js";
import type { DaemonConfig } from "../lifecycle/daemon-lifecycle.js";

export type DaemonEnv = Record<string, string | undefined>;

export interface DaemonConfigFromEnvOptions {
  loadResolvedConfig?: boolean;
  skipSystemLayer?: boolean;
  skipUserLayer?: boolean;
  runtimeProfilesPath?: string;
  runtimeProfilesConfig?: unknown;
}

export const truthyDaemonEnv = (value: string | undefined): boolean =>
  value === "1" || value === "true" || value === "yes";

export function browserGatewayConfigFromEnv(
  env: DaemonEnv,
): BrowserGatewayConfig | undefined {
  if (!truthyDaemonEnv(env.KIRAKIRA_BROWSER_GATEWAY_ENABLED)) return undefined;
  return {
    enabled: true,
    host: env.KIRAKIRA_BROWSER_GATEWAY_HOST ?? DEFAULT_BROWSER_GATEWAY_ENDPOINT.host,
    port: parseRuntimePort(
      env.KIRAKIRA_BROWSER_GATEWAY_PORT,
      DEFAULT_BROWSER_GATEWAY_ENDPOINT.port,
    ),
    path: env.KIRAKIRA_BROWSER_GATEWAY_PATH ?? DEFAULT_BROWSER_GATEWAY_ENDPOINT.path,
    token: env.KIRAKIRA_BROWSER_GATEWAY_TOKEN,
    allowedOrigins: parseRuntimeOriginList(env.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS),
  };
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function runtimeProfileFromResolvedConfig(
  resolvedConfig: ResolvedConfig,
  env: DaemonEnv,
) {
  const profiles = resolvedConfig.runtimeState?.profiles ?? [];
  const name = env.KIRAKIRA_RUNTIME_PROFILE ?? resolvedConfig.runtimeState?.default_profile;
  return profiles.find((profile) => profile.name === name) ?? profiles[0];
}

function mcpServerNamesFromResolvedConfig(
  resolvedConfig: ResolvedConfig,
  env: DaemonEnv,
): string[] {
  const profile = runtimeProfileFromResolvedConfig(resolvedConfig, env);
  return profile?.mcp_servers?.map((server) => server.name) ?? [];
}

export function kernelOptionsFromResolvedConfig(
  resolvedConfig: ResolvedConfig,
  env: DaemonEnv,
): OrchestratorKernelOptions {
  const orchestration = resolvedConfig.agentToml.orchestration;
  const profile = runtimeProfileFromResolvedConfig(resolvedConfig, env);
  const workspace = profile?.workspace_root ?? env.KIRAKIRA_WORKSPACE_ROOT ?? ".";
  const mcpServerNames = mcpServerNamesFromResolvedConfig(resolvedConfig, env);
  const maxConcurrency = positiveInteger(orchestration?.max_concurrency);
  const maxTurns = positiveInteger(orchestration?.default_subagent_turns);

  return {
    planContext: {
      workspace,
      ...(mcpServerNames.length > 0 ? { availableMcpServers: mcpServerNames } : {}),
    },
    ...(maxConcurrency !== undefined
      ? { laneCapacities: { delegated: maxConcurrency } }
      : {}),
    parentWorkerDefaults: {
      model: resolvedConfig.agentToml.model.default,
      ...(orchestration?.subagent_system_preamble
        ? { systemPrompt: orchestration.subagent_system_preamble }
        : {}),
      ...(maxTurns !== undefined ? { maxTurns } : {}),
    },
  };
}

export function loadDaemonResolvedConfig(
  workspaceRoot: string,
  env: DaemonEnv = process.env,
  options: DaemonConfigFromEnvOptions = {},
): ResolvedConfig {
  const layers = loadConfigLayers({
    workspaceRoot,
    skipSystemLayer: options.skipSystemLayer,
    skipUserLayer: options.skipUserLayer,
  });
  return resolveConfig(
    layers,
    loadPolicyYaml(workspaceRoot),
    loadLocalConfig(workspaceRoot),
    {
      runtimeEnv: env,
      runtimeProfilesPath: options.runtimeProfilesPath,
      runtimeProfilesConfig: options.runtimeProfilesConfig,
    },
  );
}

export function daemonConfigFromEnv(
  env: DaemonEnv = process.env,
  options: DaemonConfigFromEnvOptions = {},
): DaemonConfig {
  const resolvedConfig = options.loadResolvedConfig === false || !env.KIRAKIRA_WORKSPACE_ROOT
    ? undefined
    : loadDaemonResolvedConfig(env.KIRAKIRA_WORKSPACE_ROOT, env, options);
  const mcpConfigPath =
    env.KIRAKIRA_MCP_CONFIG_PATH ??
    resolvedConfig?.agentToml.mcp.config_files?.[0];
  const kernel = env.KIRAKIRA_WORKSPACE_ROOT
    ? {
        workspaceRoot: env.KIRAKIRA_WORKSPACE_ROOT,
        ...(mcpConfigPath
          ? { mcpConfigPath }
          : {}),
        ...(resolvedConfig
          ? {
              resolvedConfig,
              kernelOptions: kernelOptionsFromResolvedConfig(resolvedConfig, env),
            }
          : {}),
      }
    : mcpConfigPath
      ? { mcpConfigPath }
      : undefined;
  return {
    socketPath: env.KIRAKIRA_DAEMON_SOCKET,
    eventStorePath: env.KIRAKIRA_EVENT_STORE_PATH,
    browserGateway: browserGatewayConfigFromEnv(env),
    ...(kernel ? { kernel } : {}),
  };
}
