import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  getMcpConfigPath,
  type McpConfigFile,
  type McpServerConfig,
  type McpServerEntry,
} from "@kirakira/core";
import {
  parseMcpConfigJson,
  type ToolAlias,
} from "@kirakira/mcp-adapter";

import { resolveKirakiraRepoRoot } from "./runtime-script-command.js";

type RuntimeMcpConfigFile = McpConfigFile & {
  mcpAliases?: ToolAlias[];
};

interface RuntimeProfileLike {
  name?: unknown;
  mode?: unknown;
}

interface RuntimeMcpConfigPlanLike {
  profile?: unknown;
  mode?: unknown;
  roots?: unknown;
  serverRefs?: unknown;
  servers?: unknown;
  config?: unknown;
}

interface RuntimeMcpProjectionLike {
  roots?: unknown;
  serverRefs?: unknown;
  servers?: unknown;
  config?: unknown;
}

interface RuntimeProfileModule {
  loadRuntimeProfiles: (configPath?: string) => unknown;
  resolveRuntimeProfile: (
    profileName?: string,
    config?: unknown,
    env?: NodeJS.ProcessEnv,
  ) => RuntimeProfileLike;
  buildMcpConfigPlan: (
    profile?: RuntimeProfileLike,
    options?: Record<string, unknown>,
  ) => RuntimeMcpConfigPlanLike;
  buildRuntimeMcpProjection: (
    mcpConfigPlan: RuntimeMcpConfigPlanLike,
  ) => RuntimeMcpProjectionLike;
  renderMcpAliasCatalog: (
    profile?: RuntimeProfileLike,
    options?: Record<string, unknown>,
  ) => ToolAlias[];
}

export type RuntimeMcpConfigSource = "runtime-profile" | "local";

export interface RuntimeMcpConfigResolution {
  source: RuntimeMcpConfigSource;
  sourceLabel: string;
  cwd: string;
  localConfigPath: string;
  config: RuntimeMcpConfigFile;
  servers: McpServerConfig[];
  aliasCatalog?: readonly ToolAlias[];
  profile?: string;
  mode?: string;
  localOverlayServers: string[];
  warnings: string[];
}

export interface ResolveRuntimeMcpConfigOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  profileName?: string;
  includeLocalOverlay?: boolean;
}

export type RuntimeMcpLocalEditAction = "upsert" | "remove";

export interface RuntimeMcpLocalEditNotice {
  level: "info" | "warn";
  message: string;
}

export interface RuntimeMcpLocalEditNoticeOptions extends ResolveRuntimeMcpConfigOptions {
  configPath: string;
  serverNames: readonly string[];
  action: RuntimeMcpLocalEditAction;
}

interface ParsedMcpConfig {
  config: RuntimeMcpConfigFile;
  servers: McpServerConfig[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertRuntimeProfileModule(moduleValue: unknown): RuntimeProfileModule {
  const moduleRecord = moduleValue as Partial<RuntimeProfileModule>;
  for (const name of [
    "loadRuntimeProfiles",
    "resolveRuntimeProfile",
    "buildMcpConfigPlan",
    "buildRuntimeMcpProjection",
    "renderMcpAliasCatalog",
  ] as const) {
    if (typeof moduleRecord[name] !== "function") {
      throw new Error(`Runtime profile module is missing export ${name}`);
    }
  }
  return moduleRecord as RuntimeProfileModule;
}

async function loadRuntimeProfileModule(
  env: NodeJS.ProcessEnv,
): Promise<RuntimeProfileModule> {
  const repoRoot = resolveKirakiraRepoRoot(env);
  const scriptPath = join(repoRoot, "scripts", "runtime-profile.mjs");
  if (!existsSync(scriptPath)) {
    throw new Error(`Runtime profile script not found: ${scriptPath}`);
  }
  return assertRuntimeProfileModule(await import(pathToFileURL(scriptPath).href));
}

function parseConfigObject(config: unknown, label: string): ParsedMcpConfig {
  const text = JSON.stringify(config);
  if (!text) {
    throw new Error(`${label} did not render a JSON MCP config`);
  }
  const servers = parseMcpConfigJson(text);
  return {
    config: JSON.parse(text) as RuntimeMcpConfigFile,
    servers,
  };
}

async function readLocalMcpConfig(cwd: string): Promise<ParsedMcpConfig | undefined> {
  const configPath = getMcpConfigPath(cwd);
  if (!existsSync(configPath)) return undefined;
  const raw = await readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as McpConfigFile;
  return parseConfigObject(parsed, `Local MCP config ${configPath}`);
}

function sourceLabelForProjection(profile: string | undefined): string {
  return profile
    ? `runtime profile "${profile}" MCP projection`
    : "runtime profile MCP projection";
}

function sourceLabelForLocal(localConfigPath: string): string {
  return `local MCP config ${localConfigPath}`;
}

export function formatMcpConfigSource(resolution: RuntimeMcpConfigResolution): string {
  if (resolution.source === "local") return sourceLabelForLocal(resolution.localConfigPath);
  const overlay =
    resolution.localOverlayServers.length > 0
      ? ` plus ${resolution.localOverlayServers.length} local custom server(s)`
      : "";
  return `${sourceLabelForProjection(resolution.profile)}${overlay}`;
}

export async function resolveRuntimeMcpProjection(
  options: ResolveRuntimeMcpConfigOptions = {},
): Promise<RuntimeMcpConfigResolution> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const localConfigPath = getMcpConfigPath(cwd);
  const moduleRecord = await loadRuntimeProfileModule(env);
  const runtimeConfig = moduleRecord.loadRuntimeProfiles();
  const profile = moduleRecord.resolveRuntimeProfile(options.profileName, runtimeConfig, env);
  const configPlan = moduleRecord.buildMcpConfigPlan(profile, { config: runtimeConfig });
  const projection = moduleRecord.buildRuntimeMcpProjection(configPlan);
  const aliases = moduleRecord.renderMcpAliasCatalog(profile, { config: runtimeConfig });
  const parsed = parseConfigObject(
    projection.config ?? configPlan.config,
    sourceLabelForProjection(typeof profile.name === "string" ? profile.name : undefined),
  );
  const profileName =
    typeof profile.name === "string"
      ? profile.name
      : typeof configPlan.profile === "string"
        ? configPlan.profile
        : undefined;
  const mode =
    typeof profile.mode === "string"
      ? profile.mode
      : typeof configPlan.mode === "string"
        ? configPlan.mode
        : undefined;

  return {
    source: "runtime-profile",
    sourceLabel: sourceLabelForProjection(profileName),
    cwd,
    localConfigPath,
    config: parsed.config,
    servers: parsed.servers,
    ...(aliases.length > 0 ? { aliasCatalog: aliases } : {}),
    ...(profileName ? { profile: profileName } : {}),
    ...(mode ? { mode } : {}),
    localOverlayServers: [],
    warnings: [],
  };
}

function mergeLocalOverlay(
  projected: RuntimeMcpConfigResolution,
  local: ParsedMcpConfig,
): RuntimeMcpConfigResolution {
  const projectedServers = projected.config.mcpServers;
  const localServers = local.config.mcpServers;
  const localOverlayServers = Object.keys(localServers).filter(
    (name) => projectedServers[name] === undefined,
  );
  if (localOverlayServers.length === 0) return projected;

  const mergedConfig: RuntimeMcpConfigFile = {
    ...projected.config,
    mcpServers: {
      ...Object.fromEntries(
        localOverlayServers.map((name) => [name, localServers[name] as McpServerEntry]),
      ),
      ...projectedServers,
    },
  };
  const parsed = parseConfigObject(mergedConfig, formatMcpConfigSource(projected));
  return {
    ...projected,
    config: parsed.config,
    servers: parsed.servers,
    localOverlayServers,
    sourceLabel: formatMcpConfigSource({
      ...projected,
      localOverlayServers,
    }),
  };
}

function missingConfigError(
  localConfigPath: string,
  projectionError: unknown,
  localError: unknown,
): Error {
  const projectionMessage = projectionError
    ? `Runtime profile MCP projection failed: ${errorMessage(projectionError)}.`
    : "Runtime profile MCP projection was unavailable.";
  const localMessage = localError
    ? `Local MCP config at ${localConfigPath} is invalid: ${errorMessage(localError)}.`
    : `Local MCP config not found at ${localConfigPath}.`;
  return new Error(
    `No MCP config available. ${projectionMessage} ${localMessage} ` +
      "Select a runtime profile with KIRAKIRA_RUNTIME_PROFILE or create a local MCP config with mcp add/import/link.",
  );
}

export async function resolveRuntimeMcpConfig(
  options: ResolveRuntimeMcpConfigOptions = {},
): Promise<RuntimeMcpConfigResolution> {
  const cwd = options.cwd ?? process.cwd();
  const localConfigPath = getMcpConfigPath(cwd);
  let projectionError: unknown;

  try {
    const projected = await resolveRuntimeMcpProjection(options);
    if (options.includeLocalOverlay === false) return projected;

    try {
      const local = await readLocalMcpConfig(cwd);
      return local ? mergeLocalOverlay(projected, local) : projected;
    } catch (error) {
      return {
        ...projected,
        warnings: [
          ...projected.warnings,
          `Skipped local MCP overlay ${localConfigPath}: ${errorMessage(error)}`,
        ],
      };
    }
  } catch (error) {
    projectionError = error;
  }

  let localError: unknown;
  try {
    const local = await readLocalMcpConfig(cwd);
    if (local) {
      return {
        source: "local",
        sourceLabel: sourceLabelForLocal(localConfigPath),
        cwd,
        localConfigPath,
        config: local.config,
        servers: local.servers,
        localOverlayServers: [],
        warnings: [],
      };
    }
  } catch (error) {
    localError = error;
  }

  throw missingConfigError(localConfigPath, projectionError, localError);
}

export async function runtimeMcpLocalEditNotice(
  options: RuntimeMcpLocalEditNoticeOptions,
): Promise<RuntimeMcpLocalEditNotice | undefined> {
  try {
    const projection = await resolveRuntimeMcpProjection({
      ...options,
      includeLocalOverlay: false,
    });
    const projected = new Set(projection.servers.map((server) => server.name));
    const shadowed = options.serverNames.filter((name) => projected.has(name));
    if (options.action === "remove") {
      if (shadowed.length === 0) return undefined;
      return {
        level: "warn",
        message:
          `${formatMcpConfigSource(projection)} still defines ${quoteServerNames(shadowed)}; ` +
          `read-only MCP commands will continue to show the profile entry despite removing it from ${options.configPath}.`,
      };
    }
    if (shadowed.length > 0) {
      return {
        level: "warn",
        message:
          `${formatMcpConfigSource(projection)} already defines ${quoteServerNames(shadowed)}; ` +
          `read-only MCP commands use the profile entry before ${options.configPath}.`,
      };
    }
    return {
      level: "info",
      message: `read source: ${formatMcpConfigSource(projection)} plus non-conflicting local entries`,
    };
  } catch {
    if (options.action === "remove") return undefined;
    return {
      level: "info",
      message: "read source: local MCP config fallback",
    };
  }
}

function quoteServerNames(serverNames: readonly string[]): string {
  return serverNames.map((name) => `"${name}"`).join(", ");
}
