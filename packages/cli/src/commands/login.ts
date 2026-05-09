import { Command, Flags } from "@oclif/core";
import { saveRegistryAuth } from "../registry/auth.js";

export default class Login extends Command {
  static override description = "Authenticate with the Kirakira package registry";

  static override flags = {
    provider: Flags.string({
      description: "Provider",
      options: ["registry"],
      default: "registry",
    }),
    token: Flags.string({
      description: "Registry API token (required)",
      required: true,
    }),
    registry: Flags.string({
      description: "Registry base URL",
      env: "KIRAKIRA_REGISTRY_URL",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Login);
    if (flags.provider !== "registry") {
      this.error("Only registry authentication is supported.");
    }
    const url = (flags.registry ?? process.env.KIRAKIRA_REGISTRY_URL ?? "").trim();
    if (!url) {
      this.error(
        "Set --registry or KIRAKIRA_REGISTRY_URL to the registry base URL (e.g. https://npm.company.internal).",
      );
    }
    await saveRegistryAuth({ url, token: flags.token });
    this.log(`Saved credentials for registry ${url}`);
  }
}
