import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

import { renderMcpServers, resolveRuntimeProfile } from "./runtime-profile.mjs";

function loadEnvFileIntoProcess(workspaceRoot) {
  const envPath = join(workspaceRoot, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = unquoteEnvValue(trimmed.slice(eq + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function defaultMcpServers(profile = resolveRuntimeProfile()) {
  return renderMcpServers(profile);
}

const OBSOLETE_MCP_SERVERS = new Set([
  "filesystem",
]);

export function ensureEnvFile(workspaceRoot) {
  const envPath = join(workspaceRoot, ".env");
  if (existsSync(envPath)) {
    return { changed: false, path: envPath };
  }

  const examplePath = join(workspaceRoot, ".env.example");
  if (existsSync(examplePath)) {
    copyFileSync(examplePath, envPath);
  } else {
    writeFileSync(envPath, "", "utf8");
  }
  return { changed: true, path: envPath };
}

export function ensureMcpConfig(workspaceRoot, profile = undefined) {
  const configPath = join(workspaceRoot, ".mcp.json");
  loadEnvFileIntoProcess(workspaceRoot);
  const defaultServers = defaultMcpServers(profile ?? resolveRuntimeProfile());
  let existing = { mcpServers: {} };

  if (existsSync(configPath)) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf8"));
      if (parsed && typeof parsed === "object" && parsed.mcpServers) {
        existing = parsed;
      }
    } catch {
      existing = { mcpServers: {} };
    }
  }

  const customServers = {};
  for (const [name, config] of Object.entries(existing.mcpServers ?? {})) {
    if (Object.prototype.hasOwnProperty.call(defaultServers, name)) continue;
    if (OBSOLETE_MCP_SERVERS.has(name)) continue;
    customServers[name] = config;
  }

  const next = {
    mcpServers: {
      ...defaultServers,
      ...customServers,
    },
  };

  const nextText = JSON.stringify(next, null, 2) + "\n";
  const currentText = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
  if (currentText !== nextText) {
    writeFileSync(configPath, nextText, "utf8");
    return { changed: true, path: configPath };
  }

  return { changed: false, path: configPath };
}
