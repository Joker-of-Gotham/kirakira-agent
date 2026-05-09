import { Command, Args } from "@oclif/core";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getMcpConfigPath } from "@kirakira/core";
import { parseMcpConfigJson } from "@kirakira/mcp-adapter";

function resolveMcpImportPath(spec: string, cwd: string): string {
  const trimmed = spec.trim();
  const parts = trimmed.split(":", 2);
  if (parts.length === 2 && parts[1] !== undefined && parts[0] !== undefined) {
    const platform = parts[0].toLowerCase();
    const rest = parts[1].trim();
    if (platform === "cursor") {
      return resolve(cwd, rest || join(".cursor", "mcp.json"));
    }
    if (platform === "claude") {
      return resolve(cwd, rest || join(".mcp.json"));
    }
    if (platform === "codex") {
      return resolve(cwd, rest || join(".vscode", "mcp.json"));
    }
  }
  return resolve(cwd, trimmed);
}

export default class McpImport extends Command {
  static override description =
    "Import MCP configuration from Claude, Cursor, Codex, Copilot, or Gemini";

  static override args = {
    source: Args.string({
      description:
        "Source (cursor:.cursor/mcp.json, claude:.mcp.json, codex:.vscode/mcp.json, or path)",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpImport);
    const cwd = process.cwd();
    const srcPath = resolveMcpImportPath(args.source, cwd);

    if (!existsSync(srcPath)) {
      this.error(`MCP config not found: ${srcPath}`);
    }

    const raw = await readFile(srcPath, "utf8");
    let incoming: { mcpServers: Record<string, unknown> };
    try {
      const parsed = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
      if (!parsed.mcpServers || typeof parsed.mcpServers !== "object") {
        this.error(`Invalid MCP file (missing mcpServers): ${srcPath}`);
      }
      incoming = { mcpServers: parsed.mcpServers };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error(`Invalid JSON in ${srcPath}: ${msg}`);
    }

    parseMcpConfigJson(JSON.stringify(incoming));

    const destPath = getMcpConfigPath(cwd);
    let merged: { mcpServers: Record<string, unknown> } = { mcpServers: {} };

    if (existsSync(destPath)) {
      const existingRaw = await readFile(destPath, "utf8");
      const existing = JSON.parse(existingRaw) as { mcpServers?: Record<string, unknown> };
      merged.mcpServers = { ...(existing.mcpServers ?? {}) };
    }

    merged.mcpServers = { ...merged.mcpServers, ...incoming.mcpServers };

    parseMcpConfigJson(JSON.stringify(merged));

    await mkdir(dirname(destPath), { recursive: true });
    await writeFile(destPath, JSON.stringify(merged, null, 2) + "\n", "utf8");

    const added = Object.keys(incoming.mcpServers);
    this.log(`Merged ${added.length} server(s) from ${srcPath} into ${destPath}`);
    for (const name of added) {
      this.log(`  + ${name}`);
    }
  }
}
