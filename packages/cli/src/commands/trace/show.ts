import { Command, Args, Flags } from "@oclif/core";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getUserTracesDir } from "@kirakira/core";

function traceFilePath(traceId: string): string {
  const safe = traceId.replace(/[^\w.-]/g, "_");
  const dir = getUserTracesDir();
  return join(dir, `${safe}.jsonl`);
}

export default class TraceShow extends Command {
  static override description = "Show details for a specific trace";
  static override args = {
    traceId: Args.string({ description: "Trace ID", required: true }),
  };
  static override flags = {
    json: Flags.boolean({ description: "Output as JSON", default: false }),
  };
  async run(): Promise<void> {
    const { args, flags } = await this.parse(TraceShow);
    const dir = getUserTracesDir();
    const direct = join(dir, `${args.traceId}.jsonl`);
    const fp = existsSync(direct) ? direct : traceFilePath(args.traceId);

    if (!existsSync(fp)) {
      const dir = getUserTracesDir();
      this.error(
        `Trace file not found for "${args.traceId}". Tried:\n  ${direct}\n  ${traceFilePath(args.traceId)}\nDirectory: ${dir}`,
      );
    }

    const raw = await readFile(fp, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

    if (flags.json) {
      this.log(JSON.stringify(events, null, 2));
      return;
    }

    this.log(`Trace ${args.traceId} (${events.length} span records in ${fp})`);
    for (const ev of events) {
      const name = ev.name ?? ev.event ?? "?";
      const dur = ev.duration != null ? ` duration=${String(ev.duration)}` : "";
      this.log(`- ${String(name)}${dur}`);
      if (ev.status && typeof ev.status === "object") {
        this.log(`    status: ${JSON.stringify(ev.status)}`);
      }
    }
  }
}
