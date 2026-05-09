import { writeFile } from "node:fs/promises";
import type { AuditEvent } from "@kirakira/core";
import { mapToEcs, type EcsEvent } from "./ecs-mapper.js";

export type SiemFormat = "ecs-json" | "cef" | "hec";

function ecsEventToSplunkEnvelope(ev: EcsEvent): Record<string, unknown> {
  const epochSec = Number((Date.parse(ev["@timestamp"]) / 1000).toFixed(3));
  return {
    sourcetype: "_json",
    time: epochSec || Math.floor(Date.now() / 1000),
    fields: ev.labels ?? {},
    event: JSON.stringify(ev),
  };
}

function cefEscapeToken(val: string): string {
  return val.replace(/\|/gu, "\\|").replace(/\n/gu, " ").trim();
}

function auditToCefLine(ev: AuditEvent): string {
  const ecs = mapToEcs(ev);

  /*
   * CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
   * Extension uses flattened key=value pairs without embedded pipes.
   */
  const severity = ecs.event.outcome === "failure" ? "9" : "3";
  const name = cefEscapeToken(ecs.event.action);
  const digest = ev.entry_hash;

  const ext = [
    `msg=${cefEscapeToken(ev.event_id)}`,
    `start=${cefEscapeToken(ev.ts)}`,
    `suser=${cefEscapeToken(ev.actor.user_id)}`,
    `outcome=${cefEscapeToken(ecs.event.outcome)}`,
    `reason=${cefEscapeToken(ev.result.error_message ?? "none")}`,
    `externalId=${cefEscapeToken(ev.trace_id)}`,
    `PanoramaAudit=${cefEscapeToken(ev.decision_id ?? "none")}`,
    `fname=${cefEscapeToken(ev.subject.tool_name ?? "none")}`,
    `destinationDnsDomain=${cefEscapeToken(ev.subject.mcp_server_id ?? "none")}`,
    `digest=${cefEscapeToken(digest)}`,
    `prev_digest=${cefEscapeToken(ev.prev_hash)}`,
  ].join(" ");

  return (
    `CEF:0|Kirakira Agent|audit-ledger|0.1|${cefEscapeToken(digest)}|${name}|${severity}|` +
    ext
  );
}

export class SiemExporter {
  constructor(private readonly format: SiemFormat) {}

  export(events: AuditEvent[]): string {
    switch (this.format) {
      case "ecs-json":
        return events.map((audit) => JSON.stringify(mapToEcs(audit))).join("\n");
      case "hec":
        return events
          .map((audit) =>
            JSON.stringify(ecsEventToSplunkEnvelope(mapToEcs(audit))),
          )
          .join("\n");
      case "cef":
      default:
        return events.map((audit) => auditToCefLine(audit)).join("\n");
    }
  }

  async exportToFile(events: AuditEvent[], filePath: string): Promise<void> {
    const body = `${this.export(events)}\n`;
    await writeFile(filePath, body, "utf8");
  }
}
