import { createHash } from "node:crypto";
import type { Action, Receipt } from "../types.js";

function stableSerialize(input: unknown): string {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map((x) => stableSerialize(x)).join(",")}]`;
  }
  const obj = input as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerialize(obj[k])}`).join(",")}}`;
}

export function generateIdempotencyKey(action: Action): string {
  const body = stableSerialize({
    kind: action.kind,
    runId: action.runId,
    nodeId: action.nodeId,
    payload: action.payload,
  });
  return createHash("sha256").update(body).digest("hex");
}

export class IdempotencyLedger {
  private readonly records = new Map<string, Receipt>();

  checkReceipt(key: string): Receipt | null {
    return this.records.get(key) ?? null;
  }

  recordReceipt(key: string, receipt: Receipt): void {
    this.records.set(key, receipt);
  }
}
