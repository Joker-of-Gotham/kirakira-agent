import { Command } from "@oclif/core";

export default class Mcp extends Command {
  static override description = "Manage MCP (Model Context Protocol) servers";

  async run(): Promise<void> {
    this.log("Usage: pnpm start -- mcp [search|add|import|link|login|test|list|tools|start]");
    this.log("  start <name>          Start an MCP server and verify connectivity");
  }
}
