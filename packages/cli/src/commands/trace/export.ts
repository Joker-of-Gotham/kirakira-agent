import { Command, Flags } from "@oclif/core";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { getUserTracesDir } from "@kirakira/core";

interface TraceEvent {
  traceId?: string;
  sessionId?: string;
  event?: string;
  ts?: string;
  [key: string]: unknown;
}

function traceEventsToOtlpJson(events: TraceEvent[]): object {
  const spansByTrace = new Map<string, TraceEvent[]>();
  for (const ev of events) {
    const tid = ev.traceId ?? "0";
    if (!spansByTrace.has(tid)) spansByTrace.set(tid, []);
    spansByTrace.get(tid)!.push(ev);
  }

  const resourceSpans = [];
  for (const [traceId, traceEvents] of spansByTrace) {
    const spans = traceEvents.map((ev, idx) => {
      const ts = ev.ts ? new Date(ev.ts).getTime() * 1_000_000 : 0;
      const attrs = Object.entries(ev)
        .filter(([k]) => !["traceId", "sessionId", "event", "ts"].includes(k))
        .map(([k, v]) => ({
          key: k,
          value: { stringValue: typeof v === "string" ? v : JSON.stringify(v) },
        }));
      return {
        traceId,
        spanId: `${idx.toString(16).padStart(16, "0")}`,
        name: ev.event ?? "trace-event",
        kind: 1,
        startTimeUnixNano: String(ts),
        endTimeUnixNano: String(ts + 1_000_000),
        attributes: [
          ...attrs,
          ...(ev.sessionId ? [{ key: "session.id", value: { stringValue: ev.sessionId } }] : []),
        ],
      };
    });
    resourceSpans.push({
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "kirakira-agent" } },
        ],
      },
      scopeSpans: [{
        scope: { name: "kirakira.trace.export" },
        spans,
      }],
    });
  }

  return { resourceSpans };
}

export default class TraceExport extends Command {
  static override description = "Export trace JSONL files to a combined file or OTLP endpoint";

  static override flags = {
    format: Flags.string({
      description: "Export format",
      options: ["jsonl", "otlp"],
      default: "jsonl",
    }),
    output: Flags.string({
      char: "o",
      description: "Output file path (jsonl) or OTLP collector endpoint URL (otlp)",
    }),
    session: Flags.string({ description: "Only lines whose JSON includes this sessionId" }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TraceExport);
    if (!flags.output) {
      this.error("Pass --output / -o for the export destination.");
    }

    const dir = getUserTracesDir();
    if (!existsSync(dir)) {
      this.error(`No traces directory at ${dir}`);
    }

    const allFiles = (await readdir(dir)).filter((f) => f.endsWith(".jsonl")).sort();
    const skippedAudit = allFiles.includes("audit.jsonl");
    const usedFiles = allFiles.filter((f) => f !== "audit.jsonl");
    const parts: string[] = [];
    for (const f of usedFiles) {
      const fp = join(dir, f);
      const raw = await readFile(fp, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        if (flags.session) {
          if (!line.includes(flags.session)) continue;
        }
        parts.push(line);
      }
    }

    if (flags.format === "otlp") {
      const events: TraceEvent[] = parts.map((line) => {
        try { return JSON.parse(line) as TraceEvent; } catch { return {}; }
      });
      const otlpPayload = traceEventsToOtlpJson(events);
      const endpoint = flags.output;

      if (endpoint.startsWith("http://") || endpoint.startsWith("https://")) {
        const url = endpoint.endsWith("/v1/traces") ? endpoint : `${endpoint.replace(/\/$/, "")}/v1/traces`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(otlpPayload),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          this.error(`OTLP export failed: HTTP ${res.status} ${body.slice(0, 500)}`);
        }
        this.log(`Exported ${parts.length} event(s) as OTLP to ${url}`);
      } else {
        await mkdir(dirname(endpoint), { recursive: true });
        await writeFile(endpoint, JSON.stringify(otlpPayload, null, 2) + "\n", "utf8");
        this.log(`Wrote OTLP JSON (${parts.length} events) → ${endpoint}`);
      }
      return;
    }

    const body = parts.join("\n") + (parts.length ? "\n" : "");
    const out = flags.output;
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, body, "utf8");
    this.log(
      `Wrote ${parts.length} line(s) from ${usedFiles.length} trace file(s)${skippedAudit ? " (skipped audit.jsonl)" : ""} → ${out}`,
    );
  }
}
