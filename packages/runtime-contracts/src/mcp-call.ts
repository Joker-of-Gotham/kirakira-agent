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
}

export interface RuntimeMcpToolPolicyResult {
  effect: "allow" | "deny" | "escalate";
  reasonCodes: string[];
  approvalRequired: boolean;
  traceId: string;
}

export type RuntimeMcpServerHealth =
  | "stopped"
  | "starting"
  | "healthy"
  | "degraded"
  | "unhealthy";

export interface RuntimeMcpToolSummary {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface RuntimeMcpServerStatus {
  name: string;
  health: RuntimeMcpServerHealth;
  toolCount?: number;
  tools?: RuntimeMcpToolSummary[];
  error?: string;
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
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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
    typeof value.policy.traceId === "string"
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
    (value.outputSchema === undefined || isRecord(value.outputSchema))
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
      (Array.isArray(value.tools) && value.tools.every(isRuntimeMcpToolSummary)))
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
