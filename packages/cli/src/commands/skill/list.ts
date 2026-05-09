import { Command, Flags } from "@oclif/core";
import { homedir } from "node:os";
import { join } from "node:path";
import { discoverSkills } from "@kirakira/skill-runtime";

export default class SkillList extends Command {
  static override description = "List installed and discovered skills";

  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
    scope: Flags.string({
      description: "Filter by scope",
      options: ["workspace", "user", "all"],
      default: "all",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SkillList);
    const cwd = process.cwd();
    const cwdNorm = cwd.replace(/\\/g, "/");
    const userEam = join(homedir(), ".kirakira").replace(/\\/g, "/");
    const all = await discoverSkills(cwd);

    let list = all;
    if (flags.scope === "workspace") {
      list = all.filter((s) => s.path.replace(/\\/g, "/").startsWith(cwdNorm));
    } else if (flags.scope === "user") {
      list = all.filter((s) => {
        const p = s.path.replace(/\\/g, "/");
        return p.startsWith(userEam) && !p.startsWith(cwdNorm);
      });
    }

    if (flags.json) {
      this.log(JSON.stringify(list, null, 2));
      return;
    }

    if (list.length === 0) {
      this.log("No skills discovered. Try `kirakira-agent init` or add `.kirakira/skills/*/SKILL.md`.");
      return;
    }

    this.log(`Skills (${list.length}, scope=${flags.scope}):`);
    for (const s of list) {
      this.log(`  ${s.name}\t${s.path}`);
    }
  }
}
