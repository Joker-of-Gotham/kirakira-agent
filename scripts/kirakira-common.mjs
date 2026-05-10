import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MCP_SERVERS = {
  "filesystem-core": {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
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
      "/app/packages/mcp-filesystem-patch/dist/index.js",
      "--workspace",
      "/workspace",
    ],
  },
  "filesystem-artifact": {
    command: "node",
    args: [
      "/app/packages/mcp-filesystem-artifact/dist/index.js",
      "--workspace",
      "/workspace",
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

export function ensureMcpConfig(workspaceRoot) {
  const configPath = join(workspaceRoot, ".mcp.json");
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
    if (Object.prototype.hasOwnProperty.call(DEFAULT_MCP_SERVERS, name)) continue;
    if (OBSOLETE_MCP_SERVERS.has(name)) continue;
    customServers[name] = config;
  }

  const next = {
    mcpServers: {
      ...DEFAULT_MCP_SERVERS,
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
