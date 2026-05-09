import { Command, Args, Flags } from "@oclif/core";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { getMcpConfigPath } from "@kirakira/core";
import { McpClientManager, parseMcpConfigJson } from "@kirakira/mcp-adapter";

export default class McpStart extends Command {
  static override description = "Start an MCP server and verify connectivity";

  static override args = {
    name: Args.string({ description: "MCP server name from .mcp.json", required: true }),
  };

  static override flags = {
    "keep-alive": Flags.boolean({
      description: "Keep the server running until interrupted",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(McpStart);
    const configPath = getMcpConfigPath(process.cwd());

    if (!existsSync(configPath)) {
      this.error(
        `No MCP config at ${configPath}. Run 'kirakira-agent mcp add <name>' first.`,
      );
    }

    const raw = await readFile(configPath, "utf-8");
    const servers = parseMcpConfigJson(raw);
    const target = servers.find((s) => s.name === args.name);

    if (!target) {
      const known = servers.map((s) => s.name).join(", ");
      this.error(
        `MCP server "${args.name}" not found in ${configPath}. Known: ${known || "(none)"}`,
      );
    }

    const manager = new McpClientManager();
    manager.registerServer(target!);

    this.log(`Starting MCP server: ${args.name} (${target!.transport.kind})`);
    await manager.startServer(args.name);
    const health = manager.getHealth(args.name);
    this.log(`Status: ${health}`);

    if (flags["keep-alive"]) {
      this.log("Press Ctrl+C to stop.");
      await new Promise<void>((resolve) => {
        const onSig = async () => {
          this.log("\nStopping MCP server...");
          await manager.stopAll();
          resolve();
        };
        process.once("SIGINT", () => void onSig());
        process.once("SIGTERM", () => void onSig());
      });
    } else {
      await manager.stopAll();
    }
  }
}
