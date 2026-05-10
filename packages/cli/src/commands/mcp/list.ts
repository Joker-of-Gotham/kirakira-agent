import { Command, Flags } from "@oclif/core";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { getMcpConfigPath } from "@kirakira/core";

export default class McpList extends Command {
  static override description = "List configured MCP servers";

  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(McpList);
    const configPath = getMcpConfigPath(process.cwd());

    if (!existsSync(configPath)) {
      this.log("No .mcp.json found. Start once with 'pnpm start' or add with 'pnpm start -- mcp add <package>'.");
      return;
    }

    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw) as { mcpServers?: Record<string, unknown> };
    const servers = Object.entries(config.mcpServers ?? {});

    if (flags.json) {
      this.log(JSON.stringify(config, null, 2));
    } else {
      this.log(`MCP Servers (${servers.length}):`);
      for (const [name, cfg] of servers) {
        const c = cfg as Record<string, unknown>;
        const transport = c["type"] ?? (c["command"] ? "stdio" : "http");
        this.log(`  ${name} (${transport})`);
      }
    }
  }
}
