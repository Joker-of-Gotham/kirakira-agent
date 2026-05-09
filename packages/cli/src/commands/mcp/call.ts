import { Command, Args } from "@oclif/core";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { getMcpConfigPath } from "@kirakira/core";
import {
  McpClientManager,
  parseMcpConfigJson,
  McpGateway,
} from "@kirakira/mcp-adapter";

export default class McpCall extends Command {
  static override description =
    "Call an MCP tool by alias or qualified name (e.g. fs.list_dir or mcp.filesystem-core.list_directory)";

  static override args = {
    tool: Args.string({ description: "Tool alias or qualified name", required: true }),
    argsJson: Args.string({
      description: "JSON arguments (e.g. '{\"path\":\".\"}')",
      required: false,
      default: "{}",
    }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpCall);
    const configPath = getMcpConfigPath(process.cwd());

    if (!existsSync(configPath)) {
      this.error(`No MCP config at ${configPath}. Run 'kirakira-agent mcp add' first.`);
    }

    const raw = await readFile(configPath, "utf-8");
    const servers = parseMcpConfigJson(raw);

    let toolArgs: Record<string, unknown>;
    try {
      toolArgs = JSON.parse(args.argsJson) as Record<string, unknown>;
    } catch {
      this.error(`Invalid JSON args: ${args.argsJson}`);
    }

    const manager = new McpClientManager();
    manager.registerMany(servers);

    const gateway = new McpGateway({ manager });

    try {
      await gateway.startAll();
    } catch (err) {
      this.warn(
        `Some servers failed to start: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const result = await gateway.callTool(args.tool, toolArgs);

    if (result.error) {
      this.log(`ERROR  ${result.alias}  ${result.error}`);
      await gateway.stopAll();
      this.exit(1);
      return;
    }

    this.log(`OK  ${result.alias} → ${result.server}.${result.nativeTool}  ${result.latencyMs}ms`);
    this.log(`Policy: ${result.policyDecision}  Obligations: snapshot=${result.obligations.snapshotRequired} dryRun=${result.obligations.dryRunRequired} audit=${result.obligations.auditRequired}`);
    this.log("─".repeat(60));

    const content = result.content;
    if (typeof content === "string") {
      this.log(content);
    } else {
      this.log(JSON.stringify(content, null, 2));
    }

    await gateway.stopAll();
  }
}
