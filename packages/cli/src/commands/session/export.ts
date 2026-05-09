import { Command, Args, Flags } from "@oclif/core";
import { writeFile } from "node:fs/promises";
import { readSessionEvents } from "../../session/store.js";

export default class SessionExport extends Command {
  static override description = "Export a session to markdown, JSON, or JSONL";

  static override args = {
    id: Args.string({ description: "Session ID", required: true }),
  };

  static override flags = {
    format: Flags.string({
      description: "Export format",
      options: ["md", "json", "jsonl"],
      default: "md",
    }),
    output: Flags.string({
      char: "o",
      description: "Output file path (default: stdout)",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SessionExport);
    let events;
    try {
      events = await readSessionEvents(args.id);
    } catch {
      this.error(
        `Session not found or unreadable: ${args.id}. Check 'kirakira-agent session list'.`,
      );
    }

    let body: string;
    if (flags.format === "json") {
      body = JSON.stringify(events, null, 2) + "\n";
    } else if (flags.format === "jsonl") {
      body = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    } else {
      const lines = [
        `# Session ${args.id}`,
        "",
        ...events.map((e) => {
          const data =
            e.data !== undefined
              ? `\n\n\`\`\`json\n${JSON.stringify(e.data, null, 2)}\n\`\`\``
              : "";
          return `## ${e.ts} — ${e.event}${data}`;
        }),
      ];
      body = lines.join("\n\n") + "\n";
    }

    if (flags.output) {
      await writeFile(flags.output, body, "utf8");
      this.log(`Wrote ${flags.format} export (${events.length} events) to ${flags.output}`);
    } else {
      process.stdout.write(body);
    }
  }
}
