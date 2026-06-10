import type { RuntimeMcpToolCallResult } from "@kirakira/runtime-contracts";
import type {
  RuntimeMcpDirectoryInputField,
  RuntimeMcpDirectoryTool,
} from "./mcp-directory.js";

export type RuntimeMcpPlaygroundTone = "neutral" | "success" | "warning" | "danger";

export interface RuntimeMcpMetadataRow {
  label: string;
  value: string;
  tone: RuntimeMcpPlaygroundTone;
}

export interface RuntimeMcpArgumentDraftState {
  status: "ready" | "invalid";
  text: string;
  arguments?: Record<string, unknown>;
  error?: string;
}

export interface RuntimeMcpToolCallSummary {
  status: "success" | "error";
  title: string;
  detail: string;
  rows: RuntimeMcpMetadataRow[];
  contentText: string;
}

export interface RuntimeMcpToolPlaygroundView {
  tool?: RuntimeMcpDirectoryTool;
  fields: RuntimeMcpDirectoryInputField[];
  draft: RuntimeMcpArgumentDraftState;
  trustRows: RuntimeMcpMetadataRow[];
  policyRows: RuntimeMcpMetadataRow[];
  auditRows: RuntimeMcpMetadataRow[];
  requiresHumanConfirmation: boolean;
  callSummary?: RuntimeMcpToolCallSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) return "none";
  if (typeof value === "string") return value.trim() || "none";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function commaList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "none";
}

function boolLabel(value: boolean): string {
  return value ? "yes" : "no";
}

function parseDraft(text: string): RuntimeMcpArgumentDraftState {
  const trimmed = text.trim();
  if (!trimmed) {
    return { status: "ready", text, arguments: {} };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) {
      return {
        status: "invalid",
        text,
        error: "Arguments must be a JSON object.",
      };
    }
    return { status: "ready", text, arguments: parsed };
  } catch (err) {
    return {
      status: "invalid",
      text,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function trustTone(value: string): RuntimeMcpPlaygroundTone {
  if (value === "trusted" || value === "verified") return "success";
  if (value === "community") return "warning";
  return "neutral";
}

function policyTone(value: string): RuntimeMcpPlaygroundTone {
  if (value === "allow") return "success";
  if (value === "deny") return "danger";
  if (value === "ask" || value === "escalate") return "warning";
  return "neutral";
}

function effectTone(value: string): RuntimeMcpPlaygroundTone {
  if (value === "allow") return "success";
  if (value === "deny") return "danger";
  return "warning";
}

function auditTone(required: boolean): RuntimeMcpPlaygroundTone {
  return required ? "warning" : "neutral";
}

function maybeRow(
  rows: RuntimeMcpMetadataRow[],
  label: string,
  value: unknown,
  tone: RuntimeMcpPlaygroundTone = "neutral",
): void {
  if (value === undefined || value === null || value === "") return;
  rows.push({ label, value: stringifyValue(value), tone });
}

function trustRows(tool: RuntimeMcpDirectoryTool | undefined): RuntimeMcpMetadataRow[] {
  const trust = tool?.trust;
  if (!trust) return [];
  const rows: RuntimeMcpMetadataRow[] = [
    { label: "Tier", value: trust.tier, tone: trustTone(trust.tier) },
    { label: "Source", value: trust.source, tone: "neutral" },
    { label: "First use", value: boolLabel(trust.firstUse), tone: trust.firstUse ? "warning" : "neutral" },
    {
      label: "Annotations",
      value: boolLabel(trust.trustedAnnotations),
      tone: trust.trustedAnnotations ? "success" : "neutral",
    },
  ];
  maybeRow(rows, "Configured", trust.configuredLevel);
  maybeRow(rows, "Transport", trust.transportKind);
  maybeRow(rows, "Auth", trust.authMode);
  maybeRow(rows, "Issuer", trust.issuer);
  maybeRow(rows, "Endpoint", trust.serverUrl);
  return rows;
}

function policyRows(tool: RuntimeMcpDirectoryTool | undefined): RuntimeMcpMetadataRow[] {
  const policy = tool?.policy;
  if (!policy) return [];
  const obligations = [
    policy.obligations.snapshotRequired ? "snapshot" : undefined,
    policy.obligations.dryRunRequired ? "dry-run" : undefined,
    policy.obligations.auditRequired ? "audit" : undefined,
  ].filter((item): item is string => Boolean(item));
  const rows: RuntimeMcpMetadataRow[] = [
    { label: "Decision", value: policy.decision, tone: policyTone(policy.decision) },
    { label: "Source", value: policy.source, tone: "neutral" },
    {
      label: "Approval",
      value: boolLabel(policy.approvalRequired),
      tone: policy.approvalRequired ? "warning" : "neutral",
    },
    { label: "Reasons", value: commaList(policy.reasonCodes), tone: "neutral" },
    { label: "Obligations", value: obligations.length > 0 ? obligations.join(", ") : "none", tone: "neutral" },
  ];
  maybeRow(rows, "Decision ID", policy.decisionId);
  maybeRow(rows, "Trace", policy.traceId);
  return rows;
}

function auditRows(tool: RuntimeMcpDirectoryTool | undefined): RuntimeMcpMetadataRow[] {
  const audit = tool?.audit;
  if (!audit) return [];
  const rows: RuntimeMcpMetadataRow[] = [
    { label: "Ledger", value: audit.ledger, tone: audit.ledger === "none" ? "neutral" : "success" },
    {
      label: "Required",
      value: boolLabel(audit.auditRequired),
      tone: auditTone(audit.auditRequired),
    },
    { label: "Events", value: commaList(audit.eventKinds), tone: "neutral" },
  ];
  maybeRow(rows, "Decision ID", audit.decisionId);
  return rows;
}

export function mcpToolRequiresHumanConfirmation(
  tool: RuntimeMcpDirectoryTool | undefined,
): boolean {
  if (!tool) return false;
  const policy = tool.policy;
  const trust = tool.trust;
  return Boolean(
    policy?.approvalRequired ||
      policy?.decision === "ask" ||
      policy?.decision === "escalate" ||
      policy?.obligations.snapshotRequired ||
      policy?.obligations.dryRunRequired ||
      trust?.firstUse ||
      trust?.tier === "unknown" ||
      trust?.tier === "community",
  );
}

function contentText(result: RuntimeMcpToolCallResult): string {
  const payload =
    result.structuredContent ??
    result.content ??
    (result.error ? { error: result.error } : { success: result.success });
  return JSON.stringify(payload, null, 2);
}

function callSummary(result: RuntimeMcpToolCallResult | undefined): RuntimeMcpToolCallSummary | undefined {
  if (!result) return undefined;
  const failed = !result.success || result.isError === true;
  const rows: RuntimeMcpMetadataRow[] = [
    { label: "Latency", value: `${result.latencyMs} ms`, tone: "neutral" },
    { label: "Policy", value: result.policy.effect, tone: effectTone(result.policy.effect) },
    {
      label: "Approval",
      value: boolLabel(result.policy.approvalRequired),
      tone: result.policy.approvalRequired ? "warning" : "neutral",
    },
    { label: "Reasons", value: commaList(result.policy.reasonCodes), tone: "neutral" },
    { label: "Trace", value: result.policy.traceId, tone: "neutral" },
  ];
  maybeRow(rows, "Decision ID", result.policy.decisionId);
  maybeRow(rows, "Trust", result.trust?.tier, result.trust ? trustTone(result.trust.tier) : "neutral");
  maybeRow(rows, "Audit", result.audit?.ledger, result.audit?.ledger === "none" ? "neutral" : "success");
  return {
    status: failed ? "error" : "success",
    title: failed ? "Call failed" : "Call complete",
    detail: result.error ?? result.policy.summary ?? `${result.server}:${result.tool}`,
    rows,
    contentText: contentText(result),
  };
}

export function createMcpToolPlaygroundView(
  tool: RuntimeMcpDirectoryTool | undefined,
  draftText?: string,
  result?: RuntimeMcpToolCallResult,
): RuntimeMcpToolPlaygroundView {
  const text = draftText ?? tool?.argumentDraft ?? "{}";
  return {
    ...(tool ? { tool } : {}),
    fields: tool?.inputFields ?? [],
    draft: parseDraft(text),
    trustRows: trustRows(tool),
    policyRows: policyRows(tool),
    auditRows: auditRows(tool),
    requiresHumanConfirmation: mcpToolRequiresHumanConfirmation(tool),
    ...(result ? { callSummary: callSummary(result) } : {}),
  };
}
