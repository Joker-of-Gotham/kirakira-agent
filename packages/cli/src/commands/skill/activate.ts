import { Command, Args, Flags } from "@oclif/core";
import { discoverSkills, shouldActivateSkill } from "@kirakira/skill-runtime";

export default class SkillActivate extends Command {
  static override description =
    "Check which skills would activate for a given task description";

  static override args = {
    task: Args.string({
      description: "Task description to match against skill activation patterns",
      required: true,
    }),
  };

  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SkillActivate);
    const skills = await discoverSkills(process.cwd());

    const matched = skills.filter((s) =>
      shouldActivateSkill(args.task, s.activation),
    );

    if (flags.json) {
      this.log(JSON.stringify(matched, null, 2));
      return;
    }

    if (matched.length === 0) {
      this.log(`No skills matched task: "${args.task}"`);
      this.log(
        `(${skills.length} skill(s) checked, none have matching activation patterns)`,
      );
      return;
    }

    this.log(`Skills activated for "${args.task}" (${matched.length}/${skills.length}):\n`);
    for (const s of matched) {
      this.log(`  ${s.name}`);
      this.log(`    path: ${s.path}`);
      if (s.activation?.length) {
        this.log(`    patterns: ${s.activation.join(", ")}`);
      }
    }
  }
}
