import { Command, Flags } from "@oclif/core";
import {
  formatMcpConfigSource,
  resolveRuntimeMcpConfig,
} from "../../runtime/runtime-mcp-config.js";

export default class McpList extends Command {
  static override description = "List configured MCP servers";

  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(McpList);
    const resolution = await resolveRuntimeMcpConfig();
    for (const warning of resolution.warnings) this.warn(warning);
    const config = resolution.config;
    const servers = Object.entries(config.mcpServers ?? {});

    if (flags.json) {
      this.log(JSON.stringify(config, null, 2));
    } else {
      this.log(`MCP Servers (${servers.length}) from ${formatMcpConfigSource(resolution)}:`);
      for (const [name, cfg] of servers) {
        const c = cfg as Record<string, unknown>;
        const transport = c["type"] ?? (c["command"] ? "stdio" : "http");
        this.log(`  ${name} (${transport})`);
      }
    }
  }
}
