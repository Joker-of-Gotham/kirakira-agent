import { Command, Flags } from "@oclif/core";
import { saveRegistryAuth } from "../../registry/auth.js";

export default class RegistryLogin extends Command {
  static override description = "Authenticate with the Kirakira package registry";
  static override flags = {
    registry: Flags.string({
      description: "Registry base URL",
      env: "KIRAKIRA_REGISTRY_URL",
    }),
    token: Flags.string({
      description: "Registry API token (required)",
      required: true,
    }),
  };
  async run(): Promise<void> {
    const { flags } = await this.parse(RegistryLogin);
    const url = (flags.registry ?? process.env.KIRAKIRA_REGISTRY_URL ?? "").trim();
    if (!url) {
      this.error(
        "Set --registry or KIRAKIRA_REGISTRY_URL to the registry base URL (e.g. https://registry.example).",
      );
    }
    await saveRegistryAuth({ url, token: flags.token });
    this.log(`Saved credentials for registry ${url}`);
  }
}
