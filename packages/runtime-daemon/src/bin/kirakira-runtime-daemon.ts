#!/usr/bin/env node
import {
  DaemonLifecycle,
  registerShutdownHandlers,
  type BrowserGatewayConfig,
} from "../index.js";
import {
  DEFAULT_BROWSER_GATEWAY_ENDPOINT,
  parseRuntimeOriginList,
  parseRuntimePort,
} from "@kirakira/runtime-contracts";

const truthy = (value: string | undefined): boolean =>
  value === "1" || value === "true" || value === "yes";

const browserGatewayConfig = (): BrowserGatewayConfig | undefined => {
  if (!truthy(process.env.KIRAKIRA_BROWSER_GATEWAY_ENABLED)) return undefined;
  return {
    enabled: true,
    host: process.env.KIRAKIRA_BROWSER_GATEWAY_HOST ?? DEFAULT_BROWSER_GATEWAY_ENDPOINT.host,
    port: parseRuntimePort(
      process.env.KIRAKIRA_BROWSER_GATEWAY_PORT,
      DEFAULT_BROWSER_GATEWAY_ENDPOINT.port,
    ),
    path: process.env.KIRAKIRA_BROWSER_GATEWAY_PATH ?? DEFAULT_BROWSER_GATEWAY_ENDPOINT.path,
    token: process.env.KIRAKIRA_BROWSER_GATEWAY_TOKEN,
    allowedOrigins: parseRuntimeOriginList(process.env.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS),
  };
};

const daemon = new DaemonLifecycle();
registerShutdownHandlers(daemon);

await daemon.start({
  socketPath: process.env.KIRAKIRA_DAEMON_SOCKET,
  eventStorePath: process.env.KIRAKIRA_EVENT_STORE_PATH,
  browserGateway: browserGatewayConfig(),
});

const health = await daemon.health();
process.stdout.write(`${JSON.stringify({ ready: true, health })}\n`);
