#!/usr/bin/env node
import {
  DaemonLifecycle,
  DEFAULT_BROWSER_GATEWAY_HOST,
  DEFAULT_BROWSER_GATEWAY_PATH,
  DEFAULT_BROWSER_GATEWAY_PORT,
  registerShutdownHandlers,
  type BrowserGatewayConfig,
} from "../index.js";

const truthy = (value: string | undefined): boolean =>
  value === "1" || value === "true" || value === "yes";

const numberEnv = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const listEnv = (value: string | undefined): string[] | undefined => {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? items : undefined;
};

const browserGatewayConfig = (): BrowserGatewayConfig | undefined => {
  if (!truthy(process.env.KIRAKIRA_BROWSER_GATEWAY_ENABLED)) return undefined;
  return {
    enabled: true,
    host: process.env.KIRAKIRA_BROWSER_GATEWAY_HOST ?? DEFAULT_BROWSER_GATEWAY_HOST,
    port: numberEnv(
      process.env.KIRAKIRA_BROWSER_GATEWAY_PORT,
      DEFAULT_BROWSER_GATEWAY_PORT,
    ),
    path: process.env.KIRAKIRA_BROWSER_GATEWAY_PATH ?? DEFAULT_BROWSER_GATEWAY_PATH,
    token: process.env.KIRAKIRA_BROWSER_GATEWAY_TOKEN,
    allowedOrigins: listEnv(process.env.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS),
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
