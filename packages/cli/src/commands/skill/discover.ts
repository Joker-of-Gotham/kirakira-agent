import { Command, Flags } from "@oclif/core";
import { discoverSkillEntries } from "@kirakira/skill-runtime";

const TIER_LABELS: Record<number, string> = {
  1: "workspace (.kirakira/skills)",
  2: "lock-file (kirakira.lock file: source)",
  3: "compat (.claude/.agents/.cursor)",
  4: "user (~/.kirakira/skills)",
  5: "system (/etc/kirakira/skills)",
};

export default class SkillDiscover extends Command {
  static override description = "Run skill discovery across all tiers and show results";

  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SkillDiscover);
    const entries = await discoverSkillEntries(process.cwd());

    if (flags.json) {
      this.log(
        JSON.stringify(
          entries.map((e) => ({
            path: e.path,
            tier: e.tier,
            tierLabel: TIER_LABELS[e.tier] ?? `tier-${e.tier}`,
          })),
          null,
          2,
        ),
      );
      return;
    }

    if (entries.length === 0) {
      this.log("No skills discovered across any tier.");
      this.log("Create .kirakira/skills/<name>/SKILL.md or run `kirakira-agent init`.");
      return;
    }

    this.log(`Discovered ${entries.length} skill(s):\n`);
    let currentTier = -1;
    for (const e of entries) {
      if (e.tier !== currentTier) {
        currentTier = e.tier;
        this.log(`  [Tier ${e.tier}] ${TIER_LABELS[e.tier] ?? "unknown"}`);
      }
      this.log(`    ${e.path}`);
    }
  }
}
