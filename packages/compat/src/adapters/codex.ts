import fg from "fast-glob";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parse as parseToml } from "smol-toml";
import type { McpServerEntry } from "@kirakira/core";

export interface CodexImportScan {
  readonly skillPaths: string[];
  readonly codexTomlPath?: string;
}

export async function scanCodex(workspaceRoot: string): Promise<CodexImportScan> {
  const root = workspaceRoot.replace(/\\/g, "/");
  const skillPaths = await fg(".agents/skills/**/SKILL.md", {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });

  const codexToml = join(root, ".codex", "config.toml");
  const codexTomlPath = existsSync(codexToml) ? codexToml : undefined;
  return { skillPaths, codexTomlPath };
}

/** Best-effort parse of `[mcp_servers]` (or `mcpServers`) table from Codex TOML. */
export function parseCodexMcpServers(tomlText: string): Record<string, McpServerEntry> {
  const doc = parseToml(tomlText) as Record<string, unknown>;
  const section = (doc.mcp_servers ?? doc.mcpServers ?? doc.mcp) as
    | Record<string, unknown>
    | undefined;
  const out: Record<string, McpServerEntry> = {};
  if (!section || typeof section !== "object") {
    return out;
  }
  for (const [name, val] of Object.entries(section)) {
    if (val && typeof val === "object") {
      out[name] = val as McpServerEntry;
    }
  }
  return out;
}

export function readCodexToml(path: string): string {
  return readFileSync(path, "utf8");
}
