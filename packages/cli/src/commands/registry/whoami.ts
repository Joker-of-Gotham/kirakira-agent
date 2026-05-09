import { Command } from "@oclif/core";
import { loadRegistryAuth } from "../../registry/auth.js";

export default class RegistryWhoami extends Command {
  static override description = "Show current registry authentication";
  async run(): Promise<void> {
    const auth = await loadRegistryAuth();
    if (!auth?.url || !auth?.token) {
      this.log("Not logged in to the Kirakira registry (no saved URL/token). Run `kirakira-agent registry login --token …`.");
      return;
    }
    this.log(`Registry: ${auth.url}`);
    this.log(`Token: ${"*".repeat(Math.min(8, auth.token.length))}… (${auth.token.length} chars)`);
    if (auth.userId) this.log(`User: ${auth.userId}`);
    if (auth.expiresAt) this.log(`Expires: ${auth.expiresAt}`);
  }
}
