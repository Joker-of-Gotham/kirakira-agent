export interface RuntimeMcpToolCallRequest {
  server: string;
  tool: string;
  arguments?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
  subagentId?: string;
  role?: string;
  requestedLane?: string;
}

export interface RuntimeMcpListRequest {
  server?: string;
  includeTools?: boolean;
  startServers?: boolean;
  traceId?: string;
}

export interface RuntimeMcpToolPolicyResult {
  effect: "allow" | "deny" | "escalate";
  reasonCodes: string[];
  approvalRequired: boolean;
  traceId: string;
  decisionId?: string;
  summary?: string;
}

export type RuntimeMcpServerHealth =
  | "stopped"
  | "starting"
  | "healthy"
  | "degraded"
  | "unhealthy";

export type RuntimeMcpTrustTier = "trusted" | "verified" | "community" | "unknown";

export type RuntimeMcpTrustSource =
  | "config"
  | "registry"
  | "transport"
  | "first-use"
  | "unknown";

export interface RuntimeMcpTrustMetadata {
  tier: RuntimeMcpTrustTier;
  source: RuntimeMcpTrustSource;
  trustedAnnotations: boolean;
  firstUse: boolean;
  configuredLevel?: string;
  transportKind?: string;
  authMode?: string;
  serverUrl?: string;
  issuer?: string;
}

export type RuntimeMcpDiscoveryPolicyDecision =
  | "allow"
  | "ask"
  | "deny"
  | "escalate"
  | "not_evaluated";

export type RuntimeMcpPolicySource =
  | "gateway-rule"
  | "gateway-default"
  | "pep"
  | "not-evaluated";

export interface RuntimeMcpObligationMetadata {
  snapshotRequired: boolean;
  dryRunRequired: boolean;
  auditRequired: boolean;
}

export interface RuntimeMcpPolicyMetadata {
  decision: RuntimeMcpDiscoveryPolicyDecision;
  source: RuntimeMcpPolicySource;
  reasonCodes: string[];
  approvalRequired: boolean;
  obligations: RuntimeMcpObligationMetadata;
  traceId?: string;
  decisionId?: string;
}

export interface RuntimeMcpAuditMetadata {
  auditRequired: boolean;
  eventKinds: string[];
  ledger: "pep" | "mcp-audit-bridge" | "none";
  decisionId?: string;
}

export type RuntimeMcpOtelSpanStatus = "UNSET" | "OK" | "ERROR";

export interface RuntimeMcpOtelMetadata {
  spanName: string;
  attributes: Record<string, string | number | boolean>;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  status?: RuntimeMcpOtelSpanStatus;
  durationMs?: number;
}

export interface RuntimeMcpToolSummary {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  execution?: Record<string, unknown>;
  policy?: RuntimeMcpPolicyMetadata;
  trust?: RuntimeMcpTrustMetadata;
  audit?: RuntimeMcpAuditMetadata;
  otel?: RuntimeMcpOtelMetadata;
}

export interface RuntimeMcpServerStatus {
  name: string;
  health: RuntimeMcpServerHealth;
  toolCount?: number;
  tools?: RuntimeMcpToolSummary[];
  error?: string;
  policy?: RuntimeMcpPolicyMetadata;
  trust?: RuntimeMcpTrustMetadata;
  audit?: RuntimeMcpAuditMetadata;
  otel?: RuntimeMcpOtelMetadata;
}

export interface RuntimeMcpListResult {
  generatedAt: string;
  servers: RuntimeMcpServerStatus[];
}

export interface RuntimeMcpToolCallResult {
  server: string;
  tool: string;
  success: boolean;
  content?: unknown;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  error?: string;
  latencyMs: number;
  policy: RuntimeMcpToolPolicyResult;
  trust?: RuntimeMcpTrustMetadata;
  audit?: RuntimeMcpAuditMetadata;
  otel?: RuntimeMcpOtelMetadata;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isRuntimeMcpTrustTier(value: unknown): value is RuntimeMcpTrustTier {
  return value === "trusted" || value === "verified" || value === "community" || value === "unknown";
}

function isRuntimeMcpTrustSource(value: unknown): value is RuntimeMcpTrustSource {
  return (
    value === "config" ||
    value === "registry" ||
    value === "transport" ||
    value === "first-use" ||
    value === "unknown"
  );
}

function isRuntimeMcpTrustMetadata(value: unknown): value is RuntimeMcpTrustMetadata {
  return (
    isRecord(value) &&
    isRuntimeMcpTrustTier(value.tier) &&
    isRuntimeMcpTrustSource(value.source) &&
    typeof value.trustedAnnotations === "boolean" &&
    typeof value.firstUse === "boolean" &&
    isOptionalString(value.configuredLevel) &&
    isOptionalString(value.transportKind) &&
    isOptionalString(value.authMode) &&
    isOptionalString(value.serverUrl) &&
    isOptionalString(value.issuer)
  );
}

function isRuntimeMcpDiscoveryPolicyDecision(
  value: unknown,
): value is RuntimeMcpDiscoveryPolicyDecision {
  return (
    value === "allow" ||
    value === "ask" ||
    value === "deny" ||
    value === "escalate" ||
    value === "not_evaluated"
  );
}

function isRuntimeMcpPolicySource(value: unknown): value is RuntimeMcpPolicySource {
  return (
    value === "gateway-rule" ||
    value === "gateway-default" ||
    value === "pep" ||
    value === "not-evaluated"
  );
}

function isRuntimeMcpObligationMetadata(value: unknown): value is RuntimeMcpObligationMetadata {
  return (
    isRecord(value) &&
    typeof value.snapshotRequired === "boolean" &&
    typeof value.dryRunRequired === "boolean" &&
    typeof value.auditRequired === "boolean"
  );
}

function isRuntimeMcpPolicyMetadata(value: unknown): value is RuntimeMcpPolicyMetadata {
  return (
    isRecord(value) &&
    isRuntimeMcpDiscoveryPolicyDecision(value.decision) &&
    isRuntimeMcpPolicySource(value.source) &&
    Array.isArray(value.reasonCodes) &&
    value.reasonCodes.length === stringArray(value.reasonCodes).length &&
    typeof value.approvalRequired === "boolean" &&
    isRuntimeMcpObligationMetadata(value.obligations) &&
    isOptionalString(value.traceId) &&
    isOptionalString(value.decisionId)
  );
}

function isRuntimeMcpAuditMetadata(value: unknown): value is RuntimeMcpAuditMetadata {
  return (
    isRecord(value) &&
    typeof value.auditRequired === "boolean" &&
    Array.isArray(value.eventKinds) &&
    value.eventKinds.length === stringArray(value.eventKinds).length &&
    (value.ledger === "pep" || value.ledger === "mcp-audit-bridge" || value.ledger === "none") &&
    isOptionalString(value.decisionId)
  );
}

function isRuntimeMcpOtelAttribute(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function isRuntimeMcpOtelSpanStatus(value: unknown): value is RuntimeMcpOtelSpanStatus {
  return value === "UNSET" || value === "OK" || value === "ERROR";
}

function isRuntimeMcpOtelMetadata(value: unknown): value is RuntimeMcpOtelMetadata {
  return (
    isRecord(value) &&
    typeof value.spanName === "string" &&
    isRecord(value.attributes) &&
    Object.values(value.attributes).every(isRuntimeMcpOtelAttribute) &&
    isOptionalString(value.traceId) &&
    isOptionalString(value.spanId) &&
    isOptionalString(value.parentSpanId) &&
    (value.status === undefined || isRuntimeMcpOtelSpanStatus(value.status)) &&
    (value.durationMs === undefined ||
      (typeof value.durationMs === "number" && Number.isFinite(value.durationMs)))
  );
}

export function isRuntimeMcpToolCallResult(value: unknown): value is RuntimeMcpToolCallResult {
  if (!isRecord(value) || !isRecord(value.policy)) return false;
  return (
    typeof value.server === "string" &&
    typeof value.tool === "string" &&
    typeof value.success === "boolean" &&
    typeof value.latencyMs === "number" &&
    Number.isFinite(value.latencyMs) &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.isError === undefined || typeof value.isError === "boolean") &&
    (value.structuredContent === undefined || isRecord(value.structuredContent)) &&
    (value.policy.effect === "allow" ||
      value.policy.effect === "deny" ||
      value.policy.effect === "escalate") &&
    Array.isArray(value.policy.reasonCodes) &&
    value.policy.reasonCodes.length === stringArray(value.policy.reasonCodes).length &&
    typeof value.policy.approvalRequired === "boolean" &&
    typeof value.policy.traceId === "string" &&
    isOptionalString(value.policy.decisionId) &&
    isOptionalString(value.policy.summary) &&
    (value.trust === undefined || isRuntimeMcpTrustMetadata(value.trust)) &&
    (value.audit === undefined || isRuntimeMcpAuditMetadata(value.audit)) &&
    (value.otel === undefined || isRuntimeMcpOtelMetadata(value.otel))
  );
}

export function parseRuntimeMcpToolCallAckResult(value: unknown): RuntimeMcpToolCallResult {
  if (isRuntimeMcpToolCallResult(value)) return value;
  throw new Error("Runtime ack result is not a valid MCP tool call result");
}

function isMcpHealth(value: unknown): value is RuntimeMcpServerHealth {
  return (
    value === "stopped" ||
    value === "starting" ||
    value === "healthy" ||
    value === "degraded" ||
    value === "unhealthy"
  );
}

function isRuntimeMcpToolSummary(value: unknown): value is RuntimeMcpToolSummary {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    (value.title === undefined || typeof value.title === "string") &&
    (value.description === undefined || typeof value.description === "string") &&
    (value.inputSchema === undefined || isRecord(value.inputSchema)) &&
    (value.outputSchema === undefined || isRecord(value.outputSchema)) &&
    (value.annotations === undefined || isRecord(value.annotations)) &&
    (value.execution === undefined || isRecord(value.execution)) &&
    (value.policy === undefined || isRuntimeMcpPolicyMetadata(value.policy)) &&
    (value.trust === undefined || isRuntimeMcpTrustMetadata(value.trust)) &&
    (value.audit === undefined || isRuntimeMcpAuditMetadata(value.audit)) &&
    (value.otel === undefined || isRuntimeMcpOtelMetadata(value.otel))
  );
}

function isRuntimeMcpServerStatus(value: unknown): value is RuntimeMcpServerStatus {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isMcpHealth(value.health) &&
    (value.toolCount === undefined ||
      (typeof value.toolCount === "number" && Number.isFinite(value.toolCount))) &&
    (value.error === undefined || typeof value.error === "string") &&
    (value.tools === undefined ||
      (Array.isArray(value.tools) && value.tools.every(isRuntimeMcpToolSummary))) &&
    (value.policy === undefined || isRuntimeMcpPolicyMetadata(value.policy)) &&
    (value.trust === undefined || isRuntimeMcpTrustMetadata(value.trust)) &&
    (value.audit === undefined || isRuntimeMcpAuditMetadata(value.audit)) &&
    (value.otel === undefined || isRuntimeMcpOtelMetadata(value.otel))
  );
}

export function isRuntimeMcpListResult(value: unknown): value is RuntimeMcpListResult {
  return (
    isRecord(value) &&
    typeof value.generatedAt === "string" &&
    Array.isArray(value.servers) &&
    value.servers.every(isRuntimeMcpServerStatus)
  );
}

export function parseRuntimeMcpListAckResult(value: unknown): RuntimeMcpListResult {
  if (isRuntimeMcpListResult(value)) return value;
  throw new Error("Runtime ack result is not a valid MCP list result");
}
