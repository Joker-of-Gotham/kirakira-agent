import { Command, Args, Flags } from "@oclif/core";
import { McpClientManager } from "@kirakira/mcp-adapter";
import {
  formatMcpConfigSource,
  resolveRuntimeMcpConfig,
} from "../../runtime/runtime-mcp-config.js";

export default class McpStart extends Command {
  static override description = "Start an MCP server and verify connectivity";

  static override args = {
    name: Args.string({ description: "MCP server name from resolved config", required: true }),
  };

  static override flags = {
    "keep-alive": Flags.boolean({
      description: "Keep the server running until interrupted",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(McpStart);
    const resolution = await resolveRuntimeMcpConfig();
    const servers = resolution.servers;
    const target = servers.find((s) => s.name === args.name);

    if (!target) {
      const known = servers.map((s) => s.name).join(", ");
      this.error(
        `MCP server "${args.name}" not found in ${formatMcpConfigSource(resolution)}. Known: ${known || "(none)"}`,
      );
    }

    const manager = new McpClientManager();
    manager.registerServer(target!);

    this.log(`Starting MCP server: ${args.name} (${target!.transport.kind}) from ${formatMcpConfigSource(resolution)}`);
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
