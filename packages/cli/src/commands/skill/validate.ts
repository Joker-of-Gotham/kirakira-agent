import { Command, Args } from "@oclif/core";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadSkill } from "@kirakira/skill-runtime";
import { discoverSkills } from "@kirakira/skill-runtime";

export default class SkillValidate extends Command {
  static override description = "Validate a SKILL.md file or installed skill";

  static override args = {
    path: Args.string({ description: "Path to SKILL.md or skill name", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(SkillValidate);
    const cwd = process.cwd();
    let skillMd: string;
    const raw = args.path;
    if (raw.endsWith("SKILL.md")) {
      skillMd = resolve(cwd, raw);
    } else {
      const asDir = resolve(cwd, raw);
      if (existsSync(join(asDir, "SKILL.md"))) {
        skillMd = join(asDir, "SKILL.md");
      } else {
        const discovered = await discoverSkills(cwd);
        const hit = discovered.find((s) => s.name === raw);
        if (hit) {
          skillMd = hit.path.endsWith("SKILL.md")
            ? hit.path
            : join(hit.path, "SKILL.md");
        } else {
          skillMd = asDir;
        }
      }
    }

    if (!existsSync(skillMd)) {
      this.error(`SKILL.md not found: ${args.path}`);
    }

    try {
      const skill = loadSkill(skillMd);
      const body = skill.materialize();
      this.log(`Valid: ${skill.frontmatter.name}@${skill.frontmatter.version}`);
      this.log(`  Path: ${skill.path}`);
      this.log(`  Description: ${skill.frontmatter.description}`);
      this.log(`  Body length: ${body.body.length} chars`);
      this.log(`  Linked scripts: ${body.scripts.length}, references: ${body.references.length}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.error(msg);
    }
  }
}
