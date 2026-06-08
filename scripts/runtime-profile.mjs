#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultProfilesPath = join(repoRoot, "configs", "runtime", "profiles.json");

const SERVICE_ENV = {
  kirakirad: "KIRAKIRA_PDP_ENDPOINT",
  postgres: "DATABASE_URL",
  redis: "REDIS_URL",
  qdrant: "QDRANT_URL",
  neo4j: "NEO4J_URI",
  minio: "S3_ENDPOINT",
};

function browserGatewayEndpoint(gateway) {
  if (!gateway || gateway.enabled === false) return undefined;
  if (typeof gateway.endpoint === "string" && gateway.endpoint.length > 0) {
    return gateway.endpoint;
  }
  const protocol = gateway.protocol ?? "ws";
  if (
    typeof gateway.host !== "string" ||
    gateway.port === undefined ||
    typeof gateway.path !== "string"
  ) {
    throw new Error("Browser gateway profile requires host, port, and path");
  }
  const host = gateway.host;
  const port = gateway.port;
  const path = gateway.path;
  return `${protocol}://${host}:${port}${path.startsWith("/") ? path : `/${path}`}`;
}

export function loadRuntimeProfiles(configPath = defaultProfilesPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Runtime profile config not found: ${configPath}`);
  }
  const data = JSON.parse(readFileSync(configPath, "utf8"));
  if (!data || typeof data !== "object" || !data.profiles) {
    throw new Error(`Invalid runtime profile config: ${configPath}`);
  }
  return data;
}

export function resolveRuntimeProfile(
  profileName = undefined,
  config = loadRuntimeProfiles(),
  env = process.env,
) {
  const name = profileName || env.KIRAKIRA_RUNTIME_PROFILE || config.defaultProfile;
  const profile = config.profiles?.[name];
  if (!profile) {
    const available = Object.keys(config.profiles ?? {}).sort().join(", ");
    throw new Error(`Unknown runtime profile "${name}". Available profiles: ${available}`);
  }
  return {
    name,
    ...profile,
    workspaceRoot: env.KIRAKIRA_WORKSPACE_ROOT ?? profile.workspaceRoot,
    appRoot: env.KIRAKIRA_APP_ROOT ?? profile.appRoot,
    mcp: {
      ...(profile.mcp ?? {}),
      workspaceRoot: env.KIRAKIRA_MCP_WORKSPACE_ROOT
        ?? env.KIRAKIRA_WORKSPACE_ROOT
        ?? profile.mcp?.workspaceRoot
        ?? profile.workspaceRoot,
      appRoot: env.KIRAKIRA_MCP_APP_ROOT
        ?? env.KIRAKIRA_APP_ROOT
        ?? profile.mcp?.appRoot
        ?? profile.appRoot,
    },
  };
}

export function renderRuntimeEnv(profile = resolveRuntimeProfile()) {
  const env = {
    KIRAKIRA_RUNTIME_PROFILE: profile.name,
    KIRAKIRA_WORKSPACE_ROOT: profile.workspaceRoot,
    KIRAKIRA_APP_ROOT: profile.appRoot,
    KIRAKIRA_MCP_WORKSPACE_ROOT: profile.mcp?.workspaceRoot ?? profile.workspaceRoot,
    KIRAKIRA_MCP_APP_ROOT: profile.mcp?.appRoot ?? profile.appRoot,
  };
  for (const [serviceName, url] of Object.entries(profile.services ?? {})) {
    const envName = SERVICE_ENV[serviceName];
    if (envName && typeof url === "string") {
      env[envName] = url;
    }
  }
  const daemon = profile.daemon ?? {};
  if (typeof daemon.socketPath === "string") {
    env.KIRAKIRA_DAEMON_SOCKET = daemon.socketPath;
  }
  if (typeof daemon.eventStorePath === "string") {
    env.KIRAKIRA_EVENT_STORE_PATH = daemon.eventStorePath;
  }
  const gateway = daemon.browserGateway;
  if (gateway) {
    env.KIRAKIRA_BROWSER_GATEWAY_ENABLED = gateway.enabled === false ? "0" : "1";
    if (typeof gateway.host === "string") env.KIRAKIRA_BROWSER_GATEWAY_HOST = gateway.host;
    if (gateway.port !== undefined) env.KIRAKIRA_BROWSER_GATEWAY_PORT = String(gateway.port);
    if (typeof gateway.path === "string") env.KIRAKIRA_BROWSER_GATEWAY_PATH = gateway.path;
    if (typeof gateway.token === "string") {
      env.KIRAKIRA_BROWSER_GATEWAY_TOKEN = gateway.token;
      env.VITE_KIRAKIRA_GATEWAY_TOKEN = gateway.token;
    }
    if (Array.isArray(gateway.allowedOrigins)) {
      env.KIRAKIRA_BROWSER_GATEWAY_ALLOWED_ORIGINS = gateway.allowedOrigins.join(",");
    }
    const endpoint = browserGatewayEndpoint(gateway);
    if (endpoint) {
      env.VITE_KIRAKIRA_RUNTIME_MODE = "gateway";
      env.VITE_KIRAKIRA_GATEWAY_URL = endpoint;
    }
  }
  if (typeof profile.presentation?.web?.url === "string") {
    env.KIRAKIRA_WEB_URL = profile.presentation.web.url;
  }
  if (typeof profile.presentation?.desktop?.rendererUrl === "string") {
    env.KIRAKIRA_DESKTOP_RENDERER_URL = profile.presentation.desktop.rendererUrl;
    env.KIRAKIRA_DESKTOP_DEV_URL = profile.presentation.desktop.rendererUrl;
  }
  return env;
}

export function renderComposeArgs(profile = resolveRuntimeProfile()) {
  const args = [];
  for (const file of profile.composeFiles ?? []) {
    args.push("-f", file);
  }
  for (const composeProfile of profile.composeProfiles ?? []) {
    args.push("--profile", composeProfile);
  }
  return args;
}

export function renderMcpServers(profile = resolveRuntimeProfile()) {
  const workspaceRoot = profile.mcp?.workspaceRoot ?? profile.workspaceRoot;
  const appRoot = profile.mcp?.appRoot ?? profile.appRoot;
  return {
    "filesystem-core": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", workspaceRoot],
      env: { NODE_NO_WARNINGS: "1" },
    },
    "filesystem-search": {
      command: "npx",
      args: ["-y", "mcp-ripgrep@latest"],
      env: { NODE_NO_WARNINGS: "1" },
    },
    "filesystem-git": {
      command: "npx",
      args: ["-y", "@cyanheads/git-mcp-server"],
      env: { NODE_NO_WARNINGS: "1", NODE_ENV: "production" },
    },
    "filesystem-patch": {
      command: "node",
      args: [
        posix.join(appRoot, "packages/mcp-filesystem-patch/dist/index.js"),
        "--workspace",
        workspaceRoot,
      ],
    },
    "filesystem-artifact": {
      command: "node",
      args: [
        posix.join(appRoot, "packages/mcp-filesystem-artifact/dist/index.js"),
        "--workspace",
        workspaceRoot,
      ],
    },
    memory: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: { NODE_NO_WARNINGS: "1" },
    },
    github: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { NODE_NO_WARNINGS: "1" },
    },
  };
}

export function renderMcpConfig(profile = resolveRuntimeProfile()) {
  return { mcpServers: renderMcpServers(profile) };
}

function printEnv(env) {
  for (const [name, value] of Object.entries(env)) {
    console.log(`${name}=${value}`);
  }
}

function main(argv) {
  const [command = "show", profileName] = argv;
  const profile = resolveRuntimeProfile(profileName);
  if (command === "show") {
    console.log(JSON.stringify(profile, null, 2));
    return;
  }
  if (command === "env") {
    printEnv(renderRuntimeEnv(profile));
    return;
  }
  if (command === "compose-args") {
    console.log(renderComposeArgs(profile).join(" "));
    return;
  }
  if (command === "mcp") {
    console.log(JSON.stringify(renderMcpConfig(profile), null, 2));
    return;
  }
  throw new Error(`Unknown command "${command}"`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
