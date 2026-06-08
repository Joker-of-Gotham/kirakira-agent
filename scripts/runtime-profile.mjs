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
