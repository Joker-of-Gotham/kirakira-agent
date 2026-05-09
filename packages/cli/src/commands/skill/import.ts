import { Command, Args, Flags } from "@oclif/core";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSkill } from "@kirakira/skill-runtime";
import { getUserSkillsDir } from "@kirakira/core";

function resolveImportSource(spec: string, cwd: string): { filePath: string } | { url: string } {
  const trimmed = spec.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { url: trimmed };
  }

  const prefMatch = /^([a-z]+):(.*)$/i.exec(trimmed);
  if (prefMatch) {
    const proto = prefMatch[1]!.toLowerCase();
    const rest = prefMatch[2]!.trim() || ".";
    if (proto === "cursor") {
      return { filePath: resolve(cwd, rest) };
    }
    if (proto === "claude" || proto === "codex" || proto === "local") {
      return { filePath: resolve(cwd, rest) };
    }
  }

  return { filePath: resolve(cwd, trimmed) };
}

export default class SkillImport extends Command {
  static override description =
    "Import skills from external sources (GitHub, Claude, Cursor, Codex, local)";

  static override args = {
    source: Args.string({
      description:
        "Source (https URL to SKILL.md, path to SKILL.md, cursor:.cursor/skills/foo/SKILL.md, local:./path)",
      required: true,
    }),
  };

  static override flags = {
    scope: Flags.string({
      description: "Install scope",
      options: ["workspace", "user"],
      default: "workspace",
    }),
    trust: Flags.string({
      description: "Trust level (recorded for future policy hooks)",
      options: ["ask", "user-approved"],
      default: "ask",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SkillImport);
    const cwd = process.cwd();
    const baseDir =
      flags.scope === "user"
        ? getUserSkillsDir()
        : join(cwd, ".kirakira", "skills");

    let text: string;
    let sourceLabel: string;

    const loc = resolveImportSource(args.source, cwd);
    if ("url" in loc) {
      sourceLabel = loc.url;
      const res = await fetch(loc.url);
      if (!res.ok) {
        this.error(`Failed to download ${loc.url}: HTTP ${res.status}`);
      }
      text = await res.text();
    } else {
      sourceLabel = loc.filePath;
      if (!existsSync(loc.filePath)) {
        this.error(`Source file not found: ${loc.filePath}`);
      }
      text = await readFile(loc.filePath, "utf8");
    }

    await mkdir(baseDir, { recursive: true });
    const tmpPath = join(baseDir, `.import-${Date.now()}.md`);
    await writeFile(tmpPath, text, "utf8");

    let loaded;
    try {
      loaded = loadSkill(tmpPath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error(`Invalid SKILL.md from ${sourceLabel}: ${msg}`);
    }

    const safeName = loaded.frontmatter.name.replace(/[^\w.-]/g, "_");
    const finalDir = join(baseDir, safeName);
    if (existsSync(finalDir)) {
      this.error(`Target skill directory already exists: ${finalDir}`);
    }

    await mkdir(finalDir, { recursive: false });
    const nestedSkill = join(finalDir, "SKILL.md");
    await writeFile(nestedSkill, text, "utf8");
    await unlink(tmpPath).catch(() => {});

    loadSkill(nestedSkill);
    this.log(`Imported skill "${loaded.frontmatter.name}" → ${nestedSkill}`);
    this.log(`Trust preference: ${flags.trust} (scope=${flags.scope})`);
  }
}
