import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { Command, Flags } from "@oclif/core";
import type { AuditEvent } from "@kirakira/core";
import { getAuditLedgerDir } from "@kirakira/audit-ledger";

import chokidar from "chokidar";
import fg from "fast-glob";

export interface AuditTailOptions {
  live?: boolean;
  kind?: string;
}

const offsets = new Map<string, number>();

async function readEntire(absPath: string): Promise<Buffer> {
  const { readFile } = await import("node:fs/promises");
  return readFile(absPath);
}

async function appendNewAuditLines(absPath: string, kind?: string): Promise<void> {
  const buf = await readEntire(absPath);
  const len = buf.length;
  const start = offsets.get(absPath) ?? 0;

  if (start > len) {
    offsets.set(absPath, 0);
    return appendNewAuditLines(absPath, kind);
  }

  if (start === len) return;

  const chunk = buf.subarray(start).toString("utf8");
  offsets.set(absPath, len);

  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;
    if (kind) {
      try {
        const evt = JSON.parse(line) as AuditEvent;
        if (evt.kind !== kind) continue;
      } catch {
        continue;
      }
    }
    process.stdout.write(`${line}\n`);
  }
}

async function seedOffsets(pattern: string): Promise<void> {
  const files = await fg(pattern, { dot: false, onlyFiles: true });
  files.sort();

  await Promise.all(
    files.map(async (p) => {
      offsets.set(p, (await readEntire(p)).length);
    }),
  );
}

async function dumpRecentLines(dir: string, kind?: string, maxLines = 50): Promise<void> {
  const files = await fg(join(dir, "*.jsonl"), { dot: false, onlyFiles: true });
  files.sort();
  const allLines: string[] = [];
  for (const f of files) {
    const buf = await readEntire(f);
    const lines = buf.toString("utf8").split("\n").filter((l) => l.trim());
    for (const line of lines) {
      if (kind) {
        try {
          const evt = JSON.parse(line) as AuditEvent;
          if (evt.kind !== kind) continue;
        } catch { continue; }
      }
      allLines.push(line);
    }
  }
  const tail = allLines.slice(-maxLines);
  for (const line of tail) {
    process.stdout.write(`${line}\n`);
  }
  if (tail.length === 0) {
    console.error(`No audit events found in ${dir}`);
  }
}

export async function auditTail(options: AuditTailOptions = {}): Promise<void> {
  const dir = getAuditLedgerDir();
  await mkdir(dir, { recursive: true });

  if (!(options.live ?? true)) {
    await dumpRecentLines(dir, options.kind);
    return;
  }

  await seedOffsets(join(dir, "*.jsonl"));

  const watcher = chokidar.watch(join(dir, "*.jsonl"), {
    persistent: true,
    ignoreInitial: true,
  });

  watcher.on("add", (p) => {
    offsets.set(p, 0);
    void appendNewAuditLines(p, options.kind);
  });

  watcher.on("change", (p) => void appendNewAuditLines(p, options.kind));

  console.error(`Watching ${dir} … (Ctrl+C to stop)`);

  await new Promise<void>((finish) => {
    const teardown = (): void => {
      void watcher.close();
      finish();
    };
    process.once("SIGINT", teardown);
    process.once("SIGTERM", teardown);
  });
}

export default class AuditTailCmd extends Command {
  static override description = "Live-follow append-only ledger JSON rows";

  static override flags = {
    live: Flags.boolean({ description: "Keep watching ledger segments", default: true }),
    kind: Flags.string({ description: "Filter by AuditEvent.kind" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuditTailCmd);

    await auditTail({ live: flags.live ?? true, kind: flags.kind });
  }
}
