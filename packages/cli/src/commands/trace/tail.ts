import { Command, Flags } from "@oclif/core";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import chokidar from "chokidar";
import { getUserTracesDir } from "@kirakira/core";

const offsets = new Map<string, number>();

async function appendNewLines(filePath: string, sessionId?: string): Promise<void> {
  const st = await readFile(filePath);
  const len = st.length;
  const start = offsets.get(filePath) ?? 0;
  if (start > len) {
    offsets.set(filePath, 0);
    return appendNewLines(filePath, sessionId);
  }
  if (start === len) return;
  const chunk = st.subarray(start).toString("utf8");
  offsets.set(filePath, len);
  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;
    if (sessionId) {
      try {
        const rec = JSON.parse(line) as Record<string, unknown>;
        const sid =
          (rec.sessionId as string | undefined) ??
          (typeof rec.resource === "object" && rec.resource && "attributes" in rec.resource
            ? (rec.resource as { attributes?: Record<string, unknown> })?.attributes?.[
                "session.id"
              ]
            : undefined);
        if (String(sid ?? "") !== sessionId) continue;
      } catch {
        continue;
      }
    }
    process.stdout.write(`${line}\n`);
  }
}

export default class TraceTail extends Command {
  static override description = "Live-tail new trace JSONL rows under ~/.kirakira/traces";

  static override flags = {
    session: Flags.string({ description: "Only print lines mentioning this session ID" }),
    follow: Flags.boolean({
      char: "f",
      description: "Follow mode",
      default: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TraceTail);
    if (!flags.follow) {
      this.error("Non-follow mode is not supported; omit --no-follow to tail.");
    }

    const dir = getUserTracesDir();
    await mkdir(dir, { recursive: true });

    const glob = join(dir, "*.jsonl");
    const watcher = chokidar.watch(glob, {
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on("add", (p) => {
      offsets.set(p, 0);
      void appendNewLines(p, flags.session);
    });
    watcher.on("change", (p) => void appendNewLines(p, flags.session));

    this.log(`Watching for new data in ${dir} … (Ctrl+C to stop)`);

    await new Promise<void>((resolve) => {
      const done = () => {
        void watcher.close();
        resolve();
      };
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
    });
  }
}
