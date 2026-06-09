import { Command, Args } from "@oclif/core";
import { loadRegistryAuth } from "../../registry/auth.js";
import { RegistryClient } from "../../registry/client.js";
import {
  formatMcpConfigSource,
  resolveRuntimeMcpConfig,
} from "../../runtime/runtime-mcp-config.js";

export default class McpSearch extends Command {
  static override description = "Search MCP servers in the registry or resolved MCP config";

  static override args = {
    query: Args.string({ description: "Search query", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(McpSearch);
    const q = args.query.toLowerCase();

    const auth = await loadRegistryAuth();
    const regUrl = (process.env.KIRAKIRA_REGISTRY_URL ?? auth?.url ?? "").trim();

    if (regUrl) {
      const client = new RegistryClient({
        baseUrl: regUrl,
        getAuthToken: () => auth?.token,
      });
      try {
        const res = await client.search(args.query, "mcp");
        this.log(`Registry MCP packages (${res.total}):`);
        for (const p of res.packages) {
          this.log(`  ${p.name}@${p.version} — ${p.description ?? ""}`);
        }
        if (res.packages.length === 0) this.log("  (none)");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.error(`Registry search failed: ${msg}`);
      }
      return;
    }

    const resolution = await resolveRuntimeMcpConfig();
    const names = Object.keys(resolution.config.mcpServers ?? {});
    const hits = names.filter((n) => n.toLowerCase().includes(q));
    this.log(`${formatMcpConfigSource(resolution)} servers matching "${args.query}" (${hits.length}):`);
    for (const n of hits) {
      this.log(`  ${n}`);
    }
    if (hits.length === 0) {
      this.log("  (none)");
    }
  }
}
