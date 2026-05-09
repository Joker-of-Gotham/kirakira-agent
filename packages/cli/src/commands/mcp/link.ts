import { Command, Args } from "@oclif/core";
import { existsSync, lstatSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getMcpConfigPath } from "@kirakira/core";
import { parseMcpConfigJson } from "@kirakira/mcp-adapter";

export default class McpLink extends Command {
  static override description = "Link an MCP config file into this workspace's .mcp.json";

  static override args = {
    path: Args.string({
      description: "Path to an mcp.json file or directory containing mcp.json",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpLink);
    const cwd = process.cwd();
    let filePath = resolve(cwd, args.path);

    if (existsSync(filePath) && lstatSync(filePath).isDirectory()) {
      const a = join(filePath, "mcp.json");
      const b = join(filePath, ".mcp.json");
      if (existsSync(a)) filePath = a;
      else if (existsSync(b)) filePath = b;
      else {
        this.error(`No mcp.json or .mcp.json in directory ${filePath}`);
      }
    }

    if (!existsSync(filePath)) {
      this.error(`File not found: ${filePath}`);
    }

    const raw = await readFile(filePath, "utf8");
    const incoming = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    if (!incoming.mcpServers || typeof incoming.mcpServers !== "object") {
      this.error(`Invalid MCP config (need mcpServers): ${filePath}`);
    }
    parseMcpConfigJson(JSON.stringify({ mcpServers: incoming.mcpServers }));

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

    this.log(`Validated and merged ${Object.keys(incoming.mcpServers).length} server(s) from ${filePath}`);
    this.log(`Updated ${destPath}`);
  }
}
