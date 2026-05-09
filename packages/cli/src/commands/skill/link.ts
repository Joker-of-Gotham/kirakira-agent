import { Command, Args } from "@oclif/core";
import { mkdir, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadSkill } from "@kirakira/skill-runtime";

export default class SkillLink extends Command {
  static override description = "Symlink a local skill directory into the workspace";

  static override args = {
    path: Args.string({ description: "Path to local skill directory", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(SkillLink);
    const cwd = process.cwd();
    const abs = resolve(cwd, args.path);
    let skillMd: string | null = null;
    if (abs.endsWith("SKILL.md") && existsSync(abs)) {
      skillMd = abs;
    } else if (existsSync(join(abs, "SKILL.md"))) {
      skillMd = join(abs, "SKILL.md");
    }

    if (!skillMd) {
      this.error(`No SKILL.md under ${abs}`);
    }

    const skillDir = resolve(dirname(skillMd));

    const loaded = loadSkill(skillMd);
    const linkName = loaded.frontmatter.name.replace(/[^\w.-]/g, "_");
    const dest = join(cwd, ".kirakira", "skills", linkName);

    if (existsSync(dest)) {
      this.error(`Target already exists: ${dest}`);
    }

    await mkdir(join(cwd, ".kirakira", "skills"), { recursive: true });
    await symlink(skillDir, dest, "dir");
    this.log(`Linked ${skillDir} → ${dest}`);
  }
}
