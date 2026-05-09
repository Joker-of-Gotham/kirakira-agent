import { Command, Args } from "@oclif/core";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getMcpConfigPath } from "@kirakira/core";
import {
  McpClientManager,
  parseMcpConfigJson,
  checkServersHealth,
} from "@kirakira/mcp-adapter";

export default class McpTest extends Command {
  static override description = "Test connectivity to an MCP server (real tools/list)";

  static override args = {
    name: Args.string({ description: "MCP server name from .mcp.json", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpTest);
    const configPath = getMcpConfigPath(process.cwd());
    if (!existsSync(configPath)) {
      this.error(`No MCP config at ${configPath}`);
    }
    const raw = await readFile(configPath, "utf-8");
    const servers = parseMcpConfigJson(raw);
    const target = servers.find((s) => s.name === args.name);
    if (!target) {
      this.error(
        `MCP server "${args.name}" not found. Known: ${servers.map((s) => s.name).join(", ")}`,
      );
    }

    const manager = new McpClientManager();
    manager.registerServer(target!);
    await manager.startServer(args.name);
    try {
      const health = await checkServersHealth(manager, [target!]);
      const h = health[0];
      if (!h) {
        this.error("Health check returned no result");
      }
      if (h!.healthy) {
        this.log(
          `OK  ${h!.server}  tools=${h!.toolCount ?? 0}  ${h!.latencyMs ?? 0}ms`,
        );
      } else {
        this.log(`FAILED  ${h!.server}  ${h!.error ?? "unhealthy"}`);
        this.exit(1);
      }
    } finally {
      await manager.stopServer(args.name);
    }
  }
}
