import { Command, Args } from "@oclif/core";
import { McpClientManager, applyOauthAuth } from "@kirakira/mcp-adapter";
import {
  formatMcpConfigSource,
  resolveRuntimeMcpConfig,
} from "../../runtime/runtime-mcp-config.js";

export default class McpLogin extends Command {
  static override description = "Authenticate with a remote MCP server (OAuth/token)";

  static override args = {
    name: Args.string({ description: "MCP server name", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpLogin);
    const resolution = await resolveRuntimeMcpConfig();
    const servers = resolution.servers;
    const target = servers.find((s) => s.name === args.name);

    if (!target) {
      const known = servers.map((s) => s.name).join(", ");
      this.error(
        `Unknown server "${args.name}" in ${formatMcpConfigSource(resolution)}. Known: ${known || "(none)"}`,
      );
    }

    if (target.auth.mode === "oauth") {
      try {
        await applyOauthAuth({});
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log(`OAuth flow: ${msg}`);
        this.exit(1);
        return;
      }
    }

    const manager = new McpClientManager();
    manager.registerServer(target);
    try {
      this.log(
        `Connecting to ${args.name} (${target.transport.kind}) from ${formatMcpConfigSource(resolution)}`,
      );
      await manager.startServer(args.name);
      const health = manager.getHealth(args.name);
      this.log(`Authentication / connectivity: ${health}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error(`Failed to reach MCP server: ${msg}`);
    } finally {
      await manager.stopAll().catch(() => {});
    }
  }
}
