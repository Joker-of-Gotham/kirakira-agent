import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { PdpClient, PdpHealth } from "./pdp-types.js";

const DEFAULT_SOCK = (): string => join(homedir(), ".kirakira", "kirakirad.sock");

type PdpEndpoint =
  | { kind: "unix"; path: string; display: string }
  | { kind: "tcp"; host: string; port: number; display: string };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
  id: number | string | null;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string | null;
  error?: { code?: number; message?: string; data?: unknown };
  result?: unknown;
}

function parseJsonRpcLine(line: string): JsonRpcResponse {
  const trimmed = line.trim();
  if (trimmed.length === 0) throw new Error("empty JSON-RPC line");
  return JSON.parse(trimmed) as JsonRpcResponse;
}

function parseEndpoint(value?: string): PdpEndpoint {
  const raw = typeof value === "string" && value.length > 0 ? value : DEFAULT_SOCK();
  if (raw.toLowerCase().startsWith("tcp://")) {
    const url = new URL(raw);
    const port = Number.parseInt(url.port, 10);
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Invalid PDP TCP endpoint port: ${raw}`);
    }
    return {
      kind: "tcp",
      host: url.hostname || "127.0.0.1",
      port,
      display: raw,
    };
  }
  return { kind: "unix", path: raw, display: raw };
}

function stringField(
  obj: Record<string, unknown>,
  camel: string,
  snake: string,
): string | undefined {
  const camelValue = obj[camel];
  if (typeof camelValue === "string" && camelValue.length > 0) return camelValue;
  const snakeValue = obj[snake];
  if (typeof snakeValue === "string" && snakeValue.length > 0) return snakeValue;
  return undefined;
}

function isStandardPolicyDecision(value: unknown): value is PolicyDecision {
  const obj = value as Partial<PolicyDecision>;
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.decision_id === "string" &&
    (obj.effect === "allow" || obj.effect === "deny" || obj.effect === "escalate")
  );
}

function coercePolicyDecision(raw: unknown, input: PolicyInput): PolicyDecision {
  if (isStandardPolicyDecision(raw)) return raw;

  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const permit = obj.permit === true;
  const denyReasons = Array.isArray(obj.deny_reasons)
    ? obj.deny_reasons.filter((x): x is string => typeof x === "string")
    : [];
  const approval = obj.approval && typeof obj.approval === "object"
    ? obj.approval as Record<string, unknown>
    : {};
  const approvalRequired = approval.required === true;
  const approvalMode =
    approval.mode === "human" || approval.mode === "auto"
      ? approval.mode
      : "none";
  const obligations = Array.isArray(obj.obligations)
    ? obj.obligations as PolicyDecision["obligations"]
    : [];

  return {
    version: "kirakira.decision.v1",
    decision_id: randomUUID(),
    request_id: input.request_id,
    effect: permit ? "allow" : approvalRequired ? "escalate" : "deny",
    reason_codes: denyReasons,
    policy: {
      bundle_id: "kirakirad",
      revision: "remote",
      package: "kirakira.authz.main",
    },
    approval: {
      required: approvalRequired,
      mode: approvalMode,
      cacheable: permit && !approvalRequired,
    },
    obligations,
    explain: {
      summary: permit
        ? "Remote PDP permitted the action."
        : denyReasons.length > 0
          ? `Remote PDP denied the action: ${denyReasons.join(", ")}`
          : "Remote PDP requires approval for the action.",
      matched_rules: denyReasons.map((reason) => `remote:${reason}`),
    },
  };
}

export class IpcPdp implements PdpClient {
  readonly socketPath: string;
  readonly endpoint: PdpEndpoint;
  private readonly timeoutMs: number;
  private rpcSeq = 1;

  constructor(endpoint?: string, timeout = 3000) {
    this.endpoint = parseEndpoint(endpoint);
    this.socketPath = this.endpoint.display;
    this.timeoutMs = timeout;
  }

  private rpcLine(method: string, params: unknown = {}): Promise<unknown> {
    const id = this.rpcSeq++;
    const envelope: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      id,
    };

    const socket =
      this.endpoint.kind === "tcp"
        ? createConnection({ host: this.endpoint.host, port: this.endpoint.port })
        : createConnection({ path: this.endpoint.path });
    socket.setEncoding("utf8");
    socket.setTimeout(this.timeoutMs);

    return new Promise((resolvePromise, reject) => {
      let buf = "";

      const teardown = (): void => {
        socket.off("data", onData);
        socket.off("timeout", onTimeout);
        socket.off("error", onErr);
      };

      const done = (): void => {
        teardown();
        socket.destroySoon();
      };

      const onTimeout = (): void => {
        done();
        reject(new Error("PDP IPC timeout"));
      };

      const onErr = (e: unknown): void => {
        done();
        reject(e);
      };

      const handleLine = (line: string): void => {
        let parsed: JsonRpcResponse;
        try {
          parsed = parseJsonRpcLine(line);
        } catch (e) {
          done();
          reject(e);
          return;
        }
        if (parsed.error) {
          done();
          reject(
            Object.assign(new Error(parsed.error.message ?? "JSON-RPC error"), {
              rpcCode: parsed.error.code,
            }),
          );
          return;
        }
        done();
        resolvePromise(parsed.result);
      };

      const onData = (chunk: string): void => {
        buf += chunk;
        const idx = buf.indexOf("\n");
        if (idx >= 0) {
          handleLine(buf.slice(0, idx));
        }
      };

      socket.on("timeout", onTimeout);
      socket.on("error", onErr);
      socket.on("connect", () => {
        socket.on("data", onData);
        socket.write(Buffer.from(JSON.stringify(envelope), "utf8"));
        socket.write("\n");
      });
    });
  }

  async evaluate(input: PolicyInput): Promise<PolicyDecision> {
    const out = await this.rpcLine("evaluate", { input });
    const shaped = out as { decision?: unknown };
    return coercePolicyDecision(shaped?.decision ?? out, input);
  }

  async health(): Promise<PdpHealth> {
    const out = await this.rpcLine("health", {});
    const root = out as Record<string, unknown>;
    const nested =
      root.status && typeof root.status === "object"
        ? (root.status as Record<string, unknown>)
        : root;
    const statusValue =
      typeof nested.status === "string" ? nested.status : "healthy";
    return {
      status:
        statusValue === "degraded" || statusValue === "unavailable"
          ? statusValue
          : "healthy",
      mode:
        root.mode === "tcp" || root.mode === "ipc"
          ? root.mode
          : this.endpoint.kind === "tcp"
            ? "tcp"
            : "ipc",
      ...(stringField(nested, "bundleId", "bundle_id") !== undefined
        ? { bundleId: stringField(nested, "bundleId", "bundle_id") }
        : {}),
      ...(stringField(nested, "bundleRevision", "revision") !== undefined
        ? { bundleRevision: stringField(nested, "bundleRevision", "revision") }
        : {}),
      ...(stringField(nested, "lastDecisionAt", "last_eval") !== undefined
        ? { lastDecisionAt: stringField(nested, "lastDecisionAt", "last_eval") }
        : {}),
    };
  }

  async close(): Promise<void> {
    /* one-shot connections per RPC */
  }
}
