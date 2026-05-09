import type { InterruptToken } from "../types.js";

export function createInterruptToken(
  parts: Omit<InterruptToken, "timestamp"> & { timestamp?: string },
): InterruptToken {
  return {
    id: parts.id,
    runId: parts.runId,
    nodeId: parts.nodeId,
    reason: parts.reason,
    ...(parts.checkpointRef !== undefined ? { checkpointRef: parts.checkpointRef } : {}),
    timestamp: parts.timestamp ?? new Date().toISOString(),
    ...(parts.resumeSchema !== undefined ? { resumeSchema: parts.resumeSchema } : {}),
    ...(parts.expiresAt !== undefined ? { expiresAt: parts.expiresAt } : {}),
  };
}

export function validateToken(token: InterruptToken): boolean {
  if (typeof token !== "object" || token === null) return false;
  if (typeof token.id !== "string" || token.id.length === 0) return false;
  if (typeof token.runId !== "string" || token.runId.length === 0) return false;
  if (typeof token.nodeId !== "string" || token.nodeId.length === 0) return false;
  if (typeof token.reason !== "string") return false;
  if (typeof token.timestamp !== "string") return false;
  if (token.checkpointRef !== undefined && typeof token.checkpointRef !== "string") return false;
  if (token.resumeSchema !== undefined) {
    if (typeof token.resumeSchema !== "object" || token.resumeSchema === null) return false;
  }
  if (token.expiresAt !== undefined) {
    if (typeof token.expiresAt !== "string") return false;
    const t = Date.parse(token.expiresAt);
    if (!Number.isFinite(t)) return false;
    if (t <= Date.now()) return false;
  }
  try {
    JSON.stringify(token);
  } catch {
    return false;
  }
  return true;
}
