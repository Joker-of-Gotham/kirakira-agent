import { ulid } from "ulid";
import { randomBytes } from "node:crypto";
import { ID_PREFIX } from "../constants.js";

export function generateSessionId(): string {
  return `${ID_PREFIX.session}${ulid()}`;
}

export function generateRequestId(): string {
  return `${ID_PREFIX.request}${ulid()}`;
}

export function generateApprovalId(): string {
  return `${ID_PREFIX.approval}${ulid()}`;
}

/** W3C / OTel compatible 16-byte hex trace ID */
export function generateTraceId(): string {
  return randomBytes(16).toString("hex");
}

/** OTel compatible 8-byte hex span ID */
export function generateSpanId(): string {
  return randomBytes(8).toString("hex");
}
