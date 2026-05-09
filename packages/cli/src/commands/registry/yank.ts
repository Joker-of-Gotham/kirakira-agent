import { Command, Args, Flags } from "@oclif/core";
import { loadRegistryAuth } from "../../registry/auth.js";
import { RegistryClient } from "../../registry/client.js";

export default class RegistryYank extends Command {
  static override description = "Yank a published package version on the registry";

  static override args = {
    name: Args.string({ description: "Package name", required: true }),
    version: Args.string({ description: "Version to yank", required: true }),
  };

  static override flags = {
    kind: Flags.string({
      description: "Package kind",
      options: ["skill", "mcp", "plugin", "bundle"],
      default: "skill",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Confirm yank without interactive prompt",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RegistryYank);
    const auth = await loadRegistryAuth();
    if (!auth?.token) {
      this.error("Not logged in. Run `kirakira-agent registry login --token …`.");
    }
    const base =
      (process.env.KIRAKIRA_REGISTRY_URL ?? "").trim() || (auth?.url ?? "").trim();
    if (!base) {
      this.error("Set KIRAKIRA_REGISTRY_URL or configure registry URL via login.");
    }

    const client = new RegistryClient({
      baseUrl: base,
      getAuthToken: () => auth!.token,
    });

    try {
      await client.getPackage(flags.kind!, args.name, args.version);
    } catch {
      this.warn(
        `Package ${flags.kind}:${args.name}@${args.version} was not found (or not accessible). Proceeding anyway…`,
      );
    }

    if (!flags.yes) {
      this.error("Refusing to yank without --yes (this operation is destructive).");
    }

    try {
      await client.yank(flags.kind!, args.name, args.version);
      this.log(`Yanked ${flags.kind}:${args.name}@${args.version} on ${base}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error(msg);
    }
  }
}
