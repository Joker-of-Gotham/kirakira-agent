import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  parseRuntimeOriginList,
  parseRuntimePort,
} from "@kirakira/runtime-contracts";
import type { BrowserGatewayConfig } from "../server/browser-gateway-server.js";
import type { DaemonConfig } from "../lifecycle/daemon-lifecycle.js";

export type DaemonEnv = Record<string, string | undefined>;

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

export function daemonConfigFromEnv(env: DaemonEnv = process.env): DaemonConfig {
  const kernel = env.KIRAKIRA_WORKSPACE_ROOT
    ? {
        workspaceRoot: env.KIRAKIRA_WORKSPACE_ROOT,
        ...(env.KIRAKIRA_MCP_CONFIG_PATH
          ? { mcpConfigPath: env.KIRAKIRA_MCP_CONFIG_PATH }
          : {}),
      }
    : env.KIRAKIRA_MCP_CONFIG_PATH
      ? { mcpConfigPath: env.KIRAKIRA_MCP_CONFIG_PATH }
      : undefined;
  return {
    socketPath: env.KIRAKIRA_DAEMON_SOCKET,
    eventStorePath: env.KIRAKIRA_EVENT_STORE_PATH,
    browserGateway: browserGatewayConfigFromEnv(env),
    ...(kernel ? { kernel } : {}),
  };
}
