import { Command, Flags } from "@oclif/core";
import { existsSync, readdirSync } from "node:fs";
import { getUserSessionsDir } from "@kirakira/core";

export default class SessionList extends Command {
  static override description = "List recent sessions";

  static override flags = {
    limit: Flags.integer({ description: "Max sessions to show", default: 20 }),
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionList);
    const dir = getUserSessionsDir();
    if (!existsSync(dir)) {
      this.log("No sessions found.");
      return;
    }

    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse()
      .slice(0, flags.limit);

    if (flags.json) {
      this.log(JSON.stringify(files.map((f) => ({ id: f.replace(".jsonl", "") }))));
    } else {
      this.log(`Sessions (${files.length}):`);
      for (const f of files) {
        this.log(`  ${f.replace(".jsonl", "")}`);
      }
    }
  }
}
