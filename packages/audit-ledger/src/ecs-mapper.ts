import type { AuditEvent } from "@kirakira/core";

/** Minimal Elastic Common Schema mapping for SIEM ingestion. */
export interface EcsEvent {
  "@timestamp": string;
  event: { category: string; action: string; outcome: string };
  user: { id: string };
  process?: { name?: string; command_line?: string };
  destination?: { domain?: string };
  trace?: { id: string };
  labels: Record<string, string>;
  code_signature?: { digest?: string };
}

/** Map deterministic `audit.v1` record into ECS-friendly envelopes. */
export function mapToEcs(event: AuditEvent): EcsEvent {
  const category = ecsCategory(event.kind);

  let outcome = "unknown";
  if (event.result.status === "success") {
    outcome = "success";
  } else if (event.result.status === "error") {
    outcome = "failure";
  } else if (event.result.effect === "deny") {
    outcome = "failure";
  } else if (event.result.effect === "allow") {
    outcome = "success";
  } else if (event.result.effect === "escalate") {
    outcome = "deferred";
  }

  const labels: Record<string, string> = {
    ledger_segment: event.segment,
    ledger_entry_hash: event.entry_hash,
    ledger_prev_hash: event.prev_hash,
    ledger_event_id: event.event_id,
    audit_kind: event.kind,
    ledger_decision_hint:
      typeof event.decision_id === "string" ? event.decision_id : "",
  };

  const ecsBase: EcsEvent = {
    "@timestamp": event.ts,
    event: {
      category,
      action: ecsAction(event.kind, event.subject),
      outcome,
    },
    user: { id: event.actor.user_id },
    trace: event.trace_id.length > 0 ? { id: event.trace_id } : undefined,
    labels,
  };

  if (event.subject.tool_name ?? event.subject.command_base) {
    ecsBase.process = {
      name: event.subject.tool_name,
      command_line: event.subject.command_base,
    };
  }

  if (event.subject.mcp_server_id) {
    ecsBase.destination = { domain: event.subject.mcp_server_id };
  }

  if (
    typeof event.integrity?.bundle_digest === "string" &&
    event.integrity.bundle_digest.length > 0
  ) {
    ecsBase.code_signature = { digest: event.integrity.bundle_digest };
  }

  return ecsBase;
}

function ecsCategory(kind: AuditEvent["kind"]): string {
  if (kind.startsWith("policy.") || kind.startsWith("approval.")) {
    return "iam";
  }
  if (kind.startsWith("tool.")) {
    return "process";
  }
  if (kind.startsWith("sandbox.")) {
    return "process";
  }
  if (kind.startsWith("config.")) {
    return "configuration";
  }
  if (kind.startsWith("session.")) {
    return "session";
  }
  if (kind === "error") {
    return "process";
  }
  return "host";
}

function ecsAction(kind: AuditEvent["kind"], sub: AuditEvent["subject"]): string {
  if (sub.tool_name) {
    return `${kind}.${sub.tool_name}`;
  }
  return kind.replace(/\./g, ":");
}
