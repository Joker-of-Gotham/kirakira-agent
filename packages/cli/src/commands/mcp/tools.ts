import { Command, Args, Flags } from "@oclif/core";
import {
  McpClientManager,
  McpGateway,
} from "@kirakira/mcp-adapter";
import {
  formatMcpConfigSource,
  resolveRuntimeMcpConfig,
} from "../../runtime/runtime-mcp-config.js";

export default class McpTools extends Command {
  static override description =
    "List all available MCP tools (from all servers, with aliases)";

  static override args = {
    server: Args.string({
      description: "Filter to a specific server name",
      required: false,
    }),
  };

  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(McpTools);
    const resolution = await resolveRuntimeMcpConfig();
    const servers = resolution.servers;

    const manager = new McpClientManager();
    manager.registerMany(servers);

    const gateway = new McpGateway({
      manager,
      ...(resolution.aliasCatalog ? { aliasCatalog: resolution.aliasCatalog } : {}),
    });

    try {
      await gateway.startAll();
    } catch (err) {
      this.warn(
        `Some servers failed to start: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const allTools = gateway.getTools();
    const tools = args.server
      ? allTools.filter((t) => t.server === args.server)
      : [...allTools];

    if (flags.json) {
      this.log(JSON.stringify(tools, null, 2));
    } else {
      const summary = gateway.getSummary();
      this.log(`Source: ${formatMcpConfigSource(resolution)}`);
      this.log(`\nMCP Gateway — ${summary.totalTools} tools from ${summary.servers.length} servers\n`);

      for (const srv of summary.servers) {
        const icon = srv.health === "healthy" ? "✓" : srv.health === "stopped" ? "○" : "✗";
        this.log(`  ${icon} ${srv.name} (${srv.toolCount} tools, ${srv.health})`);
        if (srv.error) {
          this.log(`      ${srv.error}`);
        }
      }

      this.log("");

      const grouped = new Map<string, Array<(typeof tools)[number]>>();
      for (const t of tools) {
        const list = grouped.get(t.server) ?? [];
        list.push(t);
        grouped.set(t.server, list);
      }

      for (const [server, serverTools] of grouped) {
        this.log(`── ${server} ──`);
        for (const t of serverTools) {
          const risk = t.riskLevel === "high" ? "⚠" : t.riskLevel === "medium" ? "●" : "○";
          const ro = t.readOnly ? "R" : "W";
          const policy = t.policyDecision === "allow" ? "✓" : t.policyDecision === "ask" ? "?" : "✗";
          this.log(
            `  ${risk} ${policy} [${ro}] ${t.alias.padEnd(22)} → ${t.nativeTool}`,
          );
          if (t.description) {
            this.log(`       ${t.description}`);
          }
        }
        this.log("");
      }
    }

    await gateway.stopAll();
  }
}
