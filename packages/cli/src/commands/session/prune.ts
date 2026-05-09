import { Command, Flags } from "@oclif/core";
import { pruneSessions } from "../../session/manager.js";
import { listSessionFiles, sessionFileMtime } from "../../session/store.js";

function parseOlderThan(spec: string): number {
  const s = spec.trim();
  const m = /^(\d+)(d|h|m|s)$/i.exec(s);
  if (!m) {
    throw new Error(
      `Invalid --older-than "${spec}". Use a suffix: d (days), h (hours), m (minutes), s (seconds), e.g. 30d`,
    );
  }
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const mult =
    unit === "d" ? 86_400_000 : unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1000;
  return n * mult;
}

export default class SessionPrune extends Command {
  static override description = "Remove old sessions";

  static override flags = {
    "older-than": Flags.string({
      description: "Remove sessions older than (e.g. 30d, 7d, 12h)",
      default: "30d",
    }),
    "dry-run": Flags.boolean({
      description: "Only show what would be removed",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SessionPrune);
    let maxAgeMs: number;
    try {
      maxAgeMs = parseOlderThan(flags["older-than"]);
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }

    if (flags["dry-run"]) {
      const cutoff = Date.now() - maxAgeMs;
      const ids = await listSessionFiles();
      const wouldRemove: string[] = [];
      for (const id of ids) {
        try {
          const mtime = await sessionFileMtime(id);
          if (mtime.getTime() < cutoff) wouldRemove.push(id);
        } catch {
          continue;
        }
      }
      this.log(
        `Dry run: would remove ${wouldRemove.length} session file(s) older than ${flags["older-than"]}:`,
      );
      for (const id of wouldRemove) this.log(`  ${id}`);
      return;
    }

    const removed = await pruneSessions({ maxAgeMs });
    this.log(`Removed ${removed.length} session(s) older than ${flags["older-than"]}.`);
    for (const id of removed) this.log(`  ${id}`);
  }
}
