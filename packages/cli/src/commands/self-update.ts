import { Command, Flags } from "@oclif/core";

export default class SelfUpdate extends Command {
  static override description = "Report CLI version and update guidance (no bundled auto-installer)";

  static override flags = {
    channel: Flags.string({
      description: "Release channel (reserved for future registry feeds)",
      options: ["stable", "canary"],
      default: "stable",
    }),
    check: Flags.boolean({
      description: "Print whether a registry URL is configured for remote version lookup",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SelfUpdate);
    const currentVersion = this.config.version;

    this.log(`Current version: ${currentVersion}`);
    this.log(`Channel: ${flags.channel}`);

    const registry = process.env.KIRAKIRA_REGISTRY_URL?.trim();
    if (flags.check) {
      if (registry) {
        this.log(`KIRAKIRA_REGISTRY_URL is set (${registry}); use your registry client or internal release pipeline to compare versions.`);
      } else {
        this.log("KIRAKIRA_REGISTRY_URL is not set — no remote version endpoint to query from this command.");
      }
      return;
    }

    this.log(
      "Rebuild from this repository: pnpm install && pnpm exec tsup --cwd packages/cli",
    );
    if (registry) {
      this.log(`Or install from your registry at ${registry} when packages are published.`);
    }
  }
}
