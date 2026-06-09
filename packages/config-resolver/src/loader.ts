/**
 * Multi-layer config loader.
 *
 * Load order (lowest to highest priority):
 *  1. System managed  — /etc/kirakira/agent.toml
 *  2. User            — ~/.kirakira/config.toml
 *  3. Repo root       — ./agent.toml
 *  4. Nested workspace — ./.kirakira/local.toml
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";
import {
  agentTomlSchema,
  localConfigSchema,
  envExpand,
  ConfigError,
  SYSTEM_CONFIG_PATH,
  PATHS,
} from "@kirakira/core";

import type { AgentToml, ConfigLayer, LoaderOptions, LocalConfig } from "./types.js";

function tryReadToml(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    return parseToml(raw) as Record<string, unknown>;
  } catch (e) {
    throw new ConfigError(
      `Failed to parse TOML at ${path}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function expandAndValidatePartial(
  raw: Record<string, unknown>,
  path: string,
): Partial<AgentToml> {
  const expanded = envExpand(raw) as Record<string, unknown>;
  const result = agentTomlSchema.partial().safeParse(expanded);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new ConfigError(`Invalid config at ${path}: ${issues.join("; ")}`);
  }
  return result.data as Partial<AgentToml>;
}

export function loadConfigLayers(options: LoaderOptions): ConfigLayer[] {
  const layers: ConfigLayer[] = [];

  const systemPath = options.systemConfigPath ?? SYSTEM_CONFIG_PATH;
  if (!options.skipSystemLayer) {
    const data = tryReadToml(systemPath);
    if (data) {
      layers.push({
        name: "system",
        path: systemPath,
        data: expandAndValidatePartial(data, systemPath),
      });
    }
  }

  if (!options.skipUserLayer) {
    const userHome = options.userHomePath ?? join(
      process.env.HOME ?? process.env.USERPROFILE ?? "",
      PATHS.userHome,
    );
    const userPath = join(userHome, PATHS.userConfig);
    const data = tryReadToml(userPath);
    if (data) {
      layers.push({
        name: "user",
        path: userPath,
        data: expandAndValidatePartial(data, userPath),
      });
    }
  }

  const repoPath = options.repoConfigPath ?? join(options.workspaceRoot, PATHS.workspaceConfig);
  if (options.repoConfigPath && !existsSync(repoPath)) {
    throw new ConfigError(`Config file not found: ${repoPath}`);
  }
  const repoData = tryReadToml(repoPath);
  if (repoData) {
    layers.push({
      name: "repo",
      path: repoPath,
      data: expandAndValidatePartial(repoData, repoPath),
    });
  }

  const wsPath = join(options.workspaceRoot, PATHS.workspacePrivate);
  const wsData = tryReadToml(wsPath);
  if (wsData) {
    layers.push({
      name: "workspace",
      path: wsPath,
      data: expandAndValidatePartial(wsData, wsPath),
    });
  }

  return layers;
}

export function loadLocalConfig(workspaceRoot: string): LocalConfig | undefined {
  const localPath = join(workspaceRoot, PATHS.workspacePrivate);
  const raw = tryReadToml(localPath);
  if (!raw) return undefined;
  const expanded = envExpand(raw);
  const result = localConfigSchema.safeParse(expanded);
  if (!result.success) return undefined;
  return result.data;
}
