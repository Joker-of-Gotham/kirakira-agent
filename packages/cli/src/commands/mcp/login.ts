import { Command, Args } from "@oclif/core";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { getMcpConfigPath } from "@kirakira/core";
import { McpClientManager, parseMcpConfigJson, applyOauthAuth } from "@kirakira/mcp-adapter";

export default class McpLogin extends Command {
  static override description = "Authenticate with a remote MCP server (OAuth/token)";

  static override args = {
    name: Args.string({ description: "MCP server name", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpLogin);
    const configPath = getMcpConfigPath(process.cwd());

    if (!existsSync(configPath)) {
      this.error(`No MCP config at ${configPath}.`);
    }

    const raw = await readFile(configPath, "utf8");
    const servers = parseMcpConfigJson(raw);
    const target = servers.find((s) => s.name === args.name);

    if (!target) {
      const known = servers.map((s) => s.name).join(", ");
      this.error(`Unknown server "${args.name}". Known: ${known || "(none)"}`);
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
    manager.registerServer(target!);
    try {
      this.log(`Connecting to ${args.name} (${target!.transport.kind})…`);
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
