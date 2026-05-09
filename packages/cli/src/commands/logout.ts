import { Command, Flags } from "@oclif/core";
import { clearRegistryAuth } from "../registry/auth.js";

export default class Logout extends Command {
  static override description = "Remove stored authentication credentials";

  static override flags = {
    provider: Flags.string({
      description: "Provider to log out from",
      options: ["registry", "openai", "anthropic", "azure", "all"],
      default: "all",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Logout);
    if (flags.provider === "registry" || flags.provider === "all") {
      await clearRegistryAuth();
      this.log("Removed saved Kirakira registry credentials (~/.kirakira/registry/auth.json cleared).");
    } else {
      this.log(
        "Only registry credentials are stored under ~/.kirakira by this CLI. Unset other provider API keys in your environment if needed.",
      );
    }
  }
}
