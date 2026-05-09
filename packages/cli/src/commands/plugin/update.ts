import { Command, Args } from "@oclif/core";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { discoverPluginPaths, statPlugin } from "../../plugin/loader.js";
import { loadRegistryAuth } from "../../registry/auth.js";

interface PackageJson {
  version?: string;
  name?: string;
}

export default class PluginUpdate extends Command {
  static override description = "Update a plugin to the latest version";
  static override args = {
    name: Args.string({ description: "Plugin name (omit to check all)" }),
  };
  async run(): Promise<void> {
    const { args } = await this.parse(PluginUpdate);
    const cwd = process.cwd();
    const paths = await discoverPluginPaths(cwd);
    const targets: { name: string; path: string; version: string }[] = [];

    for (const p of paths) {
      const meta = await statPlugin(p);
      if (!meta) continue;
      if (args.name && meta.name !== args.name) continue;

      let version = meta.version;
      const pj = join(p, "package.json");
      if (existsSync(pj)) {
        try {
          const raw = await readFile(pj, "utf8");
          const pkg = JSON.parse(raw) as PackageJson;
          if (pkg.version) version = pkg.version;
        } catch {
          /* keep meta version */
        }
      }
      targets.push({ name: meta.name, path: p, version });
    }

    if (args.name && targets.length === 0) {
      this.error(`Plugin not found: ${args.name}`);
    }

    const reg =
      (await loadRegistryAuth())?.url ?? process.env.KIRAKIRA_REGISTRY_URL ?? "";
    this.log(`Installed plugin versions (${targets.length}):`);
    for (const t of targets) {
      this.log(`  ${t.name}@${t.version}\n    ${t.path}`);
    }

    if (!reg.trim()) {
      this.log(
        "\nSet KIRAKIRA_REGISTRY_URL to check registry for newer published versions.",
      );
    } else {
      this.log(
        `\nRegistry configured (${reg.trim()}). Compare versions manually or publish updates to the registry. Automatic version resolution requires the registry search API.`,
      );
    }
  }
}
