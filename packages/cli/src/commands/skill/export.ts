import { Command, Args, Flags } from "@oclif/core";
import { mkdir, writeFile, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { loadSkillContent } from "@kirakira/skill-runtime";
import { discoverSkills } from "@kirakira/skill-runtime";

export default class SkillExport extends Command {
  static override description = "Export a skill for publishing";

  static override args = {
    name: Args.string({ description: "Skill name", required: true }),
  };

  static override flags = {
    output: Flags.string({
      char: "o",
      description: "Output file or directory",
      default: "./dist",
    }),
    copy: Flags.boolean({
      description: "Copy the full skill directory instead of a JSON manifest",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SkillExport);
    const cwd = process.cwd();
    const discovered = await discoverSkills(cwd);
    const hit = discovered.find((s) => s.name === args.name);
    if (!hit) {
      this.error(`Skill not found: ${args.name}. Try 'kirakira-agent skill list'.`);
    }

    const skillPath = hit!.path.endsWith("SKILL.md") ? hit!.path : join(hit!.path, "SKILL.md");
    if (!existsSync(skillPath)) {
      this.error(`SKILL.md missing at ${skillPath}`);
    }

    const out = resolve(cwd, flags.output);

    if (flags.copy) {
      const srcDir = dirname(skillPath);
      const destRoot = resolve(cwd, flags.output);
      await mkdir(destRoot, { recursive: true });
      const baseName = hit!.name.replace(/[^\w.-]/g, "_");
      const target = join(destRoot, baseName);
      await cp(srcDir, target, { recursive: true });
      this.log(`Copied skill directory to ${target}`);
      return;
    }

    const content = loadSkillContent(skillPath);
    const manifest = {
      name: content.frontmatter.name,
      version: content.frontmatter.version,
      description: content.frontmatter.description,
      frontmatter: content.frontmatter,
      body: content.body,
      scripts: content.scripts,
      references: content.references,
    };
    const json = JSON.stringify(manifest, null, 2) + "\n";
    const outFile =
      out.endsWith(".json") || out.endsWith(".skill-json") ? out : join(out, `${hit!.name}.skill.json`);

    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, json, "utf8");
    this.log(`Wrote manifest to ${outFile}`);
  }
}
