import { Command, Args, Flags } from "@oclif/core";
import { loadRegistryAuth } from "../../registry/auth.js";
import { RegistryClient } from "../../registry/client.js";

export default class RegistrySearch extends Command {
  static override description = "Search the Kirakira package registry";
  static override args = {
    query: Args.string({ description: "Search query", required: true }),
  };
  static override flags = {
    kind: Flags.string({
      description: "Package kind filter",
      options: ["skill", "mcp", "plugin", "bundle"],
    }),
    registry: Flags.string({
      description: "Registry base URL",
      env: "KIRAKIRA_REGISTRY_URL",
    }),
  };
  async run(): Promise<void> {
    const { args, flags } = await this.parse(RegistrySearch);
    const auth = await loadRegistryAuth();
    const base =
      (flags.registry ?? "").trim() ||
      (process.env.KIRAKIRA_REGISTRY_URL ?? "").trim() ||
      (auth?.url ?? "").trim();

    if (!base) {
      this.error(
        "KIRAKIRA_REGISTRY_URL is not set and no registry URL is saved. Run `kirakira-agent registry login --registry … --token …` or export KIRAKIRA_REGISTRY_URL.",
      );
    }

    const client = new RegistryClient({
      baseUrl: base,
      getAuthToken: () => auth?.token,
    });
    try {
      const res = await client.search(args.query, flags.kind);
      this.log(`Results (${res.total}):`);
      for (const p of res.packages) {
        this.log(
          `  ${p.kind}:${p.name}@${p.version} — ${p.description ?? ""}${p.digest ? ` (digest ${p.digest.slice(0, 12)}…)` : ""}`,
        );
      }
      if (res.packages.length === 0) this.log("  (none)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error(msg);
    }
  }
}
