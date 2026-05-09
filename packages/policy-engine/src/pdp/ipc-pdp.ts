import { Buffer } from "node:buffer";
import { createConnection } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PolicyDecision, PolicyInput } from "@kirakira/core";

import type { PdpClient, PdpHealth } from "./pdp-types.js";

const DEFAULT_SOCK = (): string => join(homedir(), ".kirakira", "kirakirad.sock");

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

export class IpcPdp implements PdpClient {
  readonly socketPath: string;
  private readonly timeoutMs: number;
  private rpcSeq = 1;

  constructor(socketPath?: string, timeout = 3000) {
    this.socketPath =
      typeof socketPath === "string" && socketPath.length > 0 ? socketPath : DEFAULT_SOCK();
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

    const socket = createConnection({ path: this.socketPath });
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
    const out = await this.rpcLine("evaluate", input);
    return out as PolicyDecision;
  }

  async health(): Promise<PdpHealth> {
    const out = await this.rpcLine("health", {});
    const h = out as Partial<PdpHealth>;
    return {
      status: h.status ?? "healthy",
      mode: h.mode ?? "ipc",
      ...(h.bundleId !== undefined ? { bundleId: h.bundleId } : {}),
      ...(h.bundleRevision !== undefined ? { bundleRevision: h.bundleRevision } : {}),
      ...(h.lastDecisionAt !== undefined ? { lastDecisionAt: h.lastDecisionAt } : {}),
    };
  }

  async close(): Promise<void> {
    /* one-shot connections per RPC */
  }
}
