import { Command, Args, Flags } from "@oclif/core";
import { cp, mkdir, writeFile as writeFileAsync } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { loadSkill } from "@kirakira/skill-runtime";
import {
  getUserSkillsDir,
  getWorkspaceLockPath,
  readLockFile,
  writeLockFile,
  addPackageToLock,
  createEmptyLockFile,
  sha256Prefixed,
  assertPackageInstallable,
  type LockPackageEntry,
} from "@kirakira/core";
import { loadRegistryAuth } from "../../registry/auth.js";
import { RegistryClient } from "../../registry/client.js";

export default class SkillInstall extends Command {
  static override description = "Install a skill from the registry or local path";

  static override args = {
    name: Args.string({ description: "Skill name, @scope/pkg, or filesystem path", required: true }),
  };

  static override flags = {
    version: Flags.string({ description: "Specific version (registry only)", default: "latest" }),
    scope: Flags.string({
      description: "Install scope",
      options: ["workspace", "user"],
      default: "workspace",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SkillInstall);
    const cwd = process.cwd();
    const destBase =
      flags.scope === "user" ? getUserSkillsDir() : join(cwd, ".kirakira", "skills");

    const raw = args.name.trim();
    const absPath = resolve(cwd, raw);

    if (existsSync(absPath) || raw.startsWith(".") || raw.startsWith("/")) {
      const skillMd = absPath.endsWith("SKILL.md")
        ? absPath
        : join(absPath, "SKILL.md");
      if (!existsSync(skillMd)) {
        this.error(`Local skill path has no SKILL.md: ${raw}`);
      }
      const loaded = loadSkill(skillMd);
      const safe = loaded.frontmatter.name.replace(/[^\w.-]/g, "_");
      const target = join(destBase, safe);
      if (existsSync(target)) {
        this.error(`Already exists: ${target}`);
      }
      await mkdir(destBase, { recursive: true });
      await cp(dirname(skillMd), target, { recursive: true });
      loadSkill(join(target, "SKILL.md"));

      const content = (await import("node:fs")).readFileSync(skillMd);
      await this.updateLockfile(cwd, {
        kind: "skill",
        name: loaded.frontmatter.name,
        version: loaded.frontmatter.version ?? "0.0.0",
        source: `local:${raw}`,
        digest: sha256Prefixed(content),
        trust: "user-approved",
        scope: flags.scope as "workspace" | "user",
        installedAt: new Date().toISOString(),
      });

      this.log(`Installed local skill "${loaded.frontmatter.name}" → ${target}`);
      return;
    }

    if (raw.startsWith("@") || raw.includes("/")) {
      const auth = await loadRegistryAuth();
      const registryUrl =
        (process.env.KIRAKIRA_REGISTRY_URL ?? "").trim() || (auth?.url ?? "").trim();
      if (!registryUrl) {
        this.error(
          "Registry install requires KIRAKIRA_REGISTRY_URL (and registry login). Example: export KIRAKIRA_REGISTRY_URL=https://registry.example then `kirakira-agent login --token …`.",
        );
      }

      const client = new RegistryClient({
        baseUrl: registryUrl,
        getAuthToken: () => auth?.token,
      });

      const version = flags.version ?? "latest";
      this.log(`Resolving ${raw}@${version} from ${registryUrl}…`);

      let meta;
      try {
        meta = await client.getPackage("skill", raw, version);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.error(`Failed to resolve skill "${raw}@${version}": ${msg}`);
      }

      try {
        assertPackageInstallable(meta);
      } catch (e) {
        this.error(e instanceof Error ? e.message : String(e));
      }

      const digest = meta.digest;
      if (!digest) {
        this.error(`Package "${raw}@${version}" has no digest — cannot download.`);
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
      const target = join(destBase, safeName);
      if (existsSync(target)) {
        this.error(`Already exists: ${target}`);
      }
      await mkdir(target, { recursive: true });

      const blobBytes = new Uint8Array(blob);
      await writeFileAsync(join(target, "SKILL.md"), blobBytes);

      try {
        loadSkill(join(target, "SKILL.md"));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.error(`Downloaded artifact is not a valid SKILL.md: ${msg}`);
      }

      await this.updateLockfile(cwd, {
        kind: "skill",
        name: meta.name ?? raw,
        version: meta.version ?? version,
        source: `registry://${raw}@${meta.version ?? version}`,
        digest,
        trust: "user-approved",
        scope: flags.scope as "workspace" | "user",
        installedAt: new Date().toISOString(),
        provenance: meta.provenance,
      });

      this.log(
        `Installed registry skill "${meta.name ?? raw}@${meta.version ?? version}" → ${target}`,
      );
      return;
    }

    this.error(
      `Nothing to install for "${raw}". Use a local directory with SKILL.md, or @scope/name for registry packages.`,
    );
  }

  private async updateLockfile(workspaceRoot: string, entry: LockPackageEntry): Promise<void> {
    const lockPath = getWorkspaceLockPath(workspaceRoot);
    let lockFile = existsSync(lockPath)
      ? await readLockFile(lockPath)
      : createEmptyLockFile(workspaceRoot);
    lockFile = addPackageToLock(lockFile, entry);
    await writeLockFile(lockPath, lockFile);
  }
}
