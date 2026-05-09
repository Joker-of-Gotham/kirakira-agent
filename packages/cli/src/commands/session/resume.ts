import { Command, Args } from "@oclif/core";
import { existsSync } from "node:fs";
import { readSessionEvents, sessionFilePath, resolveSessionsDir } from "../../session/store.js";

export default class SessionResume extends Command {
  static override description = "Resume a previous session (load persisted JSONL transcript)";

  static override args = {
    id: Args.string({ description: "Session ID to resume", required: true }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(SessionResume);
    const fp = sessionFilePath(args.id);
    if (!existsSync(fp)) {
      this.error(
        `No session transcript at ${fp}. Known sessions live under ${resolveSessionsDir()}.`,
      );
    }
    const events = await readSessionEvents(args.id);
    this.log(`Loaded session ${args.id}: ${events.length} events`);
    const tail = events.slice(-5);
    for (const ev of tail) {
      this.log(JSON.stringify(ev));
    }
    if (events.length > 5) {
      this.log(`(${events.length - 5} older events omitted; full file: ${fp})`);
    }
  }
}
