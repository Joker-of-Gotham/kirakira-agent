import fg from "fast-glob";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ClaudeImportScan {
  readonly skillPaths: string[];
  readonly mcpConfigPaths: string[];
  readonly commandPaths: string[];
}

/** Scan Claude Code dirs: skills, MCP configs, slash commands. */
export async function scanClaude(workspaceRoot: string): Promise<ClaudeImportScan> {
  const root = workspaceRoot.replace(/\\/g, "/");
  const skillPaths = await fg(".claude/skills/**/SKILL.md", {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });

  const mcpConfigPaths: string[] = [];
  for (const rel of [".mcp.json", ".claude.json"]) {
    const p = join(root, rel);
    if (existsSync(p)) {
      mcpConfigPaths.push(p);
    }
  }

  const commandPaths = await fg(".claude/commands/**/*.md", {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  });

  return { skillPaths, mcpConfigPaths, commandPaths };
}

/** Read MCP JSON for Claude-import (raw text). */
export function readMcpConfigFile(path: string): string {
  return readFileSync(path, "utf8");
}
