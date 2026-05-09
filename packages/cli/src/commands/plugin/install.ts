import { Command, Args, Flags } from "@oclif/core";
import { cp, mkdir, writeFile as writeFileAsync } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { getUserPluginsDir } from "@kirakira/core";
import { loadRegistryAuth } from "../../registry/auth.js";
import { RegistryClient } from "../../registry/client.js";

export default class PluginInstall extends Command {
  static override description = "Install a CLI plugin";
  static override args = {
    name: Args.string({ description: "Plugin name or URI", required: true }),
  };
  static override flags = {
    version: Flags.string({ description: "Specific version (registry only)", default: "latest" }),
  };
  async run(): Promise<void> {
    const { args, flags } = await this.parse(PluginInstall);
    const raw = args.name.trim();
    const cwd = process.cwd();

    if (raw.startsWith("@") || raw.includes("/")) {
      const auth = await loadRegistryAuth();
      const registryUrl =
        (process.env.KIRAKIRA_REGISTRY_URL ?? "").trim() || (auth?.url ?? "").trim();
      if (!registryUrl) {
        this.error(
          "Registry plugin install requires KIRAKIRA_REGISTRY_URL and authentication. Export KIRAKIRA_REGISTRY_URL and run `kirakira-agent login --token …`.",
        );
      }

      const client = new RegistryClient({
        baseUrl: registryUrl,
        getAuthToken: () => auth?.token,
      });

      const version = flags.version ?? "latest";
      this.log(`Resolving plugin ${raw}@${version} from ${registryUrl}…`);

      let meta;
      try {
        meta = await client.getPackage("plugin", raw, version);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.error(`Failed to resolve plugin "${raw}@${version}": ${msg}`);
      }

      const digest = meta.digest;
      if (!digest) {
        this.error(`Plugin "${raw}@${version}" has no digest — cannot download.`);
      }

      this.log(`Downloading blob ${digest.slice(0, 16)}…`);
      let blob: ArrayBuffer;
      try {
        blob = await client.getBlob(digest);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.error(`Failed to download blob: ${msg}`);
      }

      const safeName = (meta.name ?? raw).replace(/[^\w.-]/g, "_");
      const dest = join(getUserPluginsDir(), safeName);
      if (existsSync(dest)) {
        this.error(`Plugin already exists at ${dest}`);
      }

      await mkdir(dest, { recursive: true });
      await writeFileAsync(join(dest, "plugin.tar"), new Uint8Array(blob));
      this.log(`Installed registry plugin "${meta.name ?? raw}@${meta.version ?? version}" → ${dest}`);
      return;
    }

    const src = resolve(cwd, raw);
    if (!existsSync(src)) {
      this.error(`Plugin path not found: ${raw}`);
    }

    const name = basename(src);
    const dest = join(getUserPluginsDir(), name);
    if (existsSync(dest)) {
      this.error(`Plugin already exists at ${dest}`);
    }

    await mkdir(getUserPluginsDir(), { recursive: true });
    await cp(src, dest, { recursive: true });
    this.log(`Installed plugin to ${dest}`);
  }
}
