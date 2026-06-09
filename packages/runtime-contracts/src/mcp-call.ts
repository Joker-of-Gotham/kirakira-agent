export interface RuntimeMcpToolCallRequest {
  server: string;
  tool: string;
  arguments?: Record<string, unknown>;
  runId?: string;
  traceId?: string;
}

export interface RuntimeMcpToolPolicyResult {
  effect: "allow" | "deny" | "escalate";
  reasonCodes: string[];
  approvalRequired: boolean;
  traceId: string;
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
