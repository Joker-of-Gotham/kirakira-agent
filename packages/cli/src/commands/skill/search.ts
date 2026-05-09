import { Command, Args, Flags } from "@oclif/core";
import { discoverSkills } from "@kirakira/skill-runtime";
import { loadRegistryAuth } from "../../registry/auth.js";
import { RegistryClient } from "../../registry/client.js";

export default class SkillSearch extends Command {
  static override description = "Search for skills locally or in the registry";

  static override args = {
    query: Args.string({ description: "Search query", required: true }),
  };

  static override flags = {
    registry: Flags.string({
      description: "Registry base URL (overrides KIRAKIRA_REGISTRY_URL / saved auth)",
      env: "KIRAKIRA_REGISTRY_URL",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SkillSearch);
    const cwd = process.cwd();
    const q = args.query.toLowerCase();

    const auth = await loadRegistryAuth();
    const regUrl =
      (flags.registry ?? "").trim() ||
      (process.env.KIRAKIRA_REGISTRY_URL ?? "").trim() ||
      (auth?.url ?? "").trim();

    if (regUrl) {
      const client = new RegistryClient({
        baseUrl: regUrl,
        getAuthToken: () => auth?.token,
      });
      try {
        const res = await client.search(args.query, "skill");
        this.log(`Registry matches (${res.total}):`);
        for (const p of res.packages) {
          this.log(`  ${p.kind}:${p.name}@${p.version} — ${p.description ?? ""}`);
        }
        if (res.packages.length === 0) {
          this.log("  (none)");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.error(`Registry search failed: ${msg}`);
      }
      return;
    }

    const local = await discoverSkills(cwd);
    const hits = local.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    );
    this.log(`Local skills matching "${args.query}" (${hits.length}):`);
    for (const s of hits) {
      this.log(`  ${s.name} — ${s.description}`);
      this.log(`    ${s.path}`);
    }
    if (hits.length === 0) {
      this.log("  (none). Set KIRAKIRA_REGISTRY_URL to search the remote registry.");
    }
  }
}
