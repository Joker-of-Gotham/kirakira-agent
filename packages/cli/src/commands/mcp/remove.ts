import { Command, Args } from "@oclif/core";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { getMcpConfigPath } from "@kirakira/core";

export default class McpRemove extends Command {
  static override description = "Remove an MCP server from .mcp.json";

  static override args = {
    name: Args.string({
      description: "Server name to remove",
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpRemove);
    const configPath = getMcpConfigPath(process.cwd());

    if (!existsSync(configPath)) {
      this.error("No .mcp.json found.");
    }

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as {
      mcpServers?: Record<string, unknown>;
    };

    if (!config.mcpServers?.[args.name]) {
      this.error(`Server "${args.name}" not found in .mcp.json`);
    }

    delete config.mcpServers[args.name];

    await writeFile(
      configPath,
      JSON.stringify(config, null, 2) + "\n",
      "utf-8",
    );

    this.log(`✓ Removed MCP server "${args.name}" from ${configPath}`);
  }
}
