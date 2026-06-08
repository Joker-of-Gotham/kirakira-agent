#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const defaultProfilesPath = join(repoRoot, "configs", "runtime", "profiles.json");

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

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeRecordMap(base = {}, override = {}) {
  return { ...(isRecord(base) ? base : {}), ...(isRecord(override) ? override : {}) };
}

function mergeEnvBindings(base = {}, override = {}) {
  return {
    services: mergeRecordMap(base.services, override.services),
    values: mergeRecordMap(base.values, override.values),
    booleans: mergeRecordMap(base.booleans, override.booleans),
    joined: mergeRecordMap(base.joined, override.joined),
    computed: mergeRecordMap(base.computed, override.computed),
  };
}

function pathValue(root, path) {
  if (typeof path !== "string" || path.length === 0) return undefined;
  return path.split(".").reduce((value, segment) => {
    if (!isRecord(value)) return undefined;
    return value[segment];
  }, root);
}

function envNames(target) {
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.filter((name) => typeof name === "string");
  if (isRecord(target)) return envNames(target.env);
  return [];
}

function setEnvValue(env, target, value) {
  if (value === undefined || value === null) return;
  for (const name of envNames(target)) {
    env[name] = String(value);
  }
}

function isWindowsNamedPipePath(value) {
  const normalized = String(value).replace(/\//gu, "\\").toLowerCase();
  return normalized.startsWith("\\\\.\\pipe\\") || normalized.startsWith("\\\\?\\pipe\\");
}

function sanitizePipeName(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/gu, "-").replace(/^-+|-+$/gu, "") || "daemon";
}

function resolveDaemonSocketPath(value, options = {}) {
  const platform = options.platform ?? process.platform;
  const configured = typeof value === "string" ? value.trim() : "";
  if (platform !== "win32") {
    return configured || join(options.homeDir ?? homedir(), ".kirakira-agent", "daemon.sock");
  }
  if (configured && isWindowsNamedPipePath(configured)) {
    return configured;
  }
  const pathForName = configured || join(options.homeDir ?? homedir(), ".kirakira-agent", "daemon.sock");
  const cwd = options.cwd ?? repoRoot;
  const absoluteBasis = isAbsolute(pathForName) ? pathForName : resolve(cwd, pathForName);
  const base = sanitizePipeName(basename(pathForName).replace(/\.sock$/iu, ""));
  const digest = createHash("sha256").update(absoluteBasis).digest("hex").slice(0, 12);
  return `\\\\.\\pipe\\kirakira-agent-${base}-${digest}`;
}

function resolveBindingValue(target, value) {
  if (isRecord(target) && target.resolve === "daemonSocketPath") {
    return resolveDaemonSocketPath(value);
  }
  return value;
}

function renderBoundEnv(env, profile) {
  const bindings = profile.envBindings ?? {};
  for (const [serviceName, url] of Object.entries(profile.services ?? {})) {
    setEnvValue(env, bindings.services?.[serviceName], typeof url === "string" ? url : undefined);
  }
  for (const [path, target] of Object.entries(bindings.values ?? {})) {
    setEnvValue(env, target, resolveBindingValue(target, pathValue(profile, path)));
  }
  for (const [path, target] of Object.entries(bindings.booleans ?? {})) {
    const value = pathValue(profile, path);
    if (value === undefined) continue;
    const trueValue = isRecord(target) && target.true !== undefined ? target.true : "1";
    const falseValue = isRecord(target) && target.false !== undefined ? target.false : "0";
    setEnvValue(env, target, value === false ? falseValue : trueValue);
  }
  for (const [path, target] of Object.entries(bindings.joined ?? {})) {
    const value = pathValue(profile, path);
    if (!Array.isArray(value)) continue;
    const separator = isRecord(target) && typeof target.separator === "string" ? target.separator : ",";
    setEnvValue(env, target, value.join(separator));
  }

  const gatewayBinding = bindings.computed?.browserGatewayEndpoint;
  if (gatewayBinding) {
    const gateway = pathValue(profile, gatewayBinding.source ?? "daemon.browserGateway");
    const endpoint = browserGatewayEndpoint(gateway);
    if (endpoint) {
      setEnvValue(env, gatewayBinding.urlEnv, endpoint);
      setEnvValue(env, gatewayBinding.modeEnv, gatewayBinding.mode ?? "gateway");
    }
  }
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
  const envBindings = mergeEnvBindings(config.envBindings, profile.envBindings);
  return {
    name,
    ...profile,
    envBindings,
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
  renderBoundEnv(env, profile);
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
