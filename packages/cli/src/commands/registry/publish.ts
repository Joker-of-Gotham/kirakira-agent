import { Command, Args, Flags } from "@oclif/core";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import type { PackageKind } from "@kirakira/core";
import { loadSkill } from "@kirakira/skill-runtime";
import { loadRegistryAuth } from "../../registry/auth.js";
import { RegistryClient } from "../../registry/client.js";

async function collectFiles(dir: string, base: string): Promise<Array<{ rel: string; content: Buffer }>> {
  const entries = await readdir(dir, { withFileTypes: true });
  const results: Array<{ rel: string; content: Buffer }> = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      results.push(...(await collectFiles(full, base)));
    } else if (entry.isFile()) {
      results.push({ rel: relative(base, full), content: await readFile(full) });
    }
  }
  return results;
}

function packFiles(files: Array<{ rel: string; content: Buffer }>): Buffer {
  const entries: Buffer[] = [];
  for (const file of files) {
    const header = Buffer.from(JSON.stringify({ path: file.rel, size: file.content.length }) + "\n");
    entries.push(header, file.content);
  }
  return Buffer.concat(entries);
}

export default class RegistryPublish extends Command {
  static override description = "Validate and optionally publish a package to the registry";

  static override args = {
    path: Args.string({ description: "Path to package directory", default: "." }),
  };

  static override flags = {
    kind: Flags.string({
      description: "Package kind",
      options: ["skill", "mcp", "plugin", "bundle"],
      default: "skill",
    }),
    push: Flags.boolean({
      description: "Upload to the registry (requires KIRAKIRA_REGISTRY_URL; without --push shows preview)",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RegistryPublish);
    const root = resolve(process.cwd(), args.path);

    if (!existsSync(root)) {
      this.error(`Path not found: ${root}`);
    }

    const auth = await loadRegistryAuth();
    if (!auth?.token) {
      this.error("Not logged in. Run `kirakira-agent registry login --token …`.");
    }
    const regUrl =
      (process.env.KIRAKIRA_REGISTRY_URL ?? "").trim() || (auth?.url ?? "").trim();
    if (!regUrl) {
      this.error("Set KIRAKIRA_REGISTRY_URL or save a registry URL via login.");
    }

    const kind = flags.kind as PackageKind;
    let name: string;
    let version: string;
    let description: string | undefined;

    if (kind === "skill") {
      const skillMd = join(root, "SKILL.md");
      if (!existsSync(skillMd)) {
        this.error(`Skill package must contain SKILL.md under ${root}`);
      }
      const skill = loadSkill(skillMd);
      name = skill.frontmatter.name;
      version = skill.frontmatter.version ?? "0.0.0";
      description = skill.frontmatter.description;
    } else {
      const pkgJson = join(root, "package.json");
      if (!existsSync(pkgJson)) {
        this.error(`Expected package.json in ${root} for kind=${kind}`);
      }
      const pkg = JSON.parse(await readFile(pkgJson, "utf8")) as {
        name?: string;
        version?: string;
        description?: string;
      };
      if (!pkg.name || !pkg.version) {
        this.error("package.json must include name and version");
      }
      name = pkg.name;
      version = pkg.version;
      description = pkg.description;
    }

    const files = await collectFiles(root, root);
    const packed = packFiles(files);
    const digest = `sha256:${createHash("sha256").update(packed).digest("hex")}`;

    this.log(`Publish plan (${flags.push ? "LIVE" : "preview"}):`);
    this.log(`  Registry: ${regUrl}`);
    this.log(`  Kind: ${kind}`);
    this.log(`  Name: ${name}`);
    this.log(`  Version: ${version}`);
    if (description) this.log(`  Description: ${description}`);
    this.log(`  Root: ${root}`);
    this.log(`  Files: ${files.length}`);
    this.log(`  Packed size: ${packed.length} bytes`);
    this.log(`  Digest: ${digest}`);

    if (!flags.push) {
      this.log("\nPreview only — pass --push to upload.");
      return;
    }

    const client = new RegistryClient({
      baseUrl: regUrl,
      getAuthToken: () => auth!.token,
    });

    this.log("\nUploading…");
    try {
      const meta = {
        name,
        version,
        kind,
        digest,
        description,
        publisher: "",
        publishedAt: new Date().toISOString(),
        trustLevel: "user-approved" as const,
      };
      const result = await client.publish(meta, packed);
      this.log(`Published ${kind}:${name}@${version} (digest: ${result.digest})`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error(`Publish failed: ${msg}`);
    }
  }
}
