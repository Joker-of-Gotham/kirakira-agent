import { execa } from "execa";

import type { McpStdioTransport } from "@kirakira/core";

const DEFAULT_STARTUP_TIMEOUT_MS = 30_000;
const STDERR_TAIL_MAX = 4_000;

/**
 * Encode a JSON-RPC message as newline-delimited JSON (official MCP SDK format).
 * Falls back to Content-Length framing when `legacy` mode is used.
 */
export function encodeJsonRpcMessage(payload: unknown, legacy = false): Buffer {
  const body = JSON.stringify(payload);
  if (legacy) {
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    return Buffer.concat([Buffer.from(header, "utf8"), Buffer.from(body, "utf8")]);
  }
  return Buffer.from(body + "\n", "utf8");
}

/**
 * Hybrid framer that supports both newline-delimited JSON (NDJSON, used by
 * the official @modelcontextprotocol/sdk) and Content-Length framing (used by
 * LSP-style servers). Auto-detects based on the first bytes received.
 */
class HybridJsonRpcFramer {
  private buf = Buffer.alloc(0);
  private detectedMode: "ndjson" | "content-length" | null = null;

  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const messages: unknown[] = [];

    if (this.detectedMode === null) {
      const peek = this.buf.toString("utf8", 0, Math.min(this.buf.length, 32));
      if (/^Content-Length:/i.test(peek)) {
        this.detectedMode = "content-length";
      } else if (peek.includes("{")) {
        this.detectedMode = "ndjson";
      } else {
        return messages;
      }
    }

    if (this.detectedMode === "ndjson") {
      this.drainNdjson(messages);
    } else {
      this.drainContentLength(messages);
    }
    return messages;
  }

  private drainNdjson(out: unknown[]): void {
    while (true) {
      const idx = this.buf.indexOf(0x0a); // '\n'
      if (idx === -1) break;
      const line = this.buf.toString("utf8", 0, idx).replace(/\r$/, "");
      this.buf = this.buf.subarray(idx + 1);
      if (line.length === 0) continue;
      try {
        out.push(JSON.parse(line));
      } catch {
        /* skip malformed */
      }
    }
  }

  private drainContentLength(out: unknown[]): void {
    while (true) {
      const txt = this.buf.toString("utf8");
      const headerEnd = txt.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const header = txt.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) break;
      const len = Number(match[1]);
      const bytesHeader = Buffer.byteLength(header + "\r\n\r\n", "utf8");
      if (this.buf.length < bytesHeader + len) break;
      const bodyBuf = this.buf.subarray(bytesHeader, bytesHeader + len);
      const body = bodyBuf.toString("utf8");
      this.buf = this.buf.subarray(bytesHeader + len);
      try {
        out.push(JSON.parse(body));
      } catch {
        /* skip malformed */
      }
    }
  }
}

function isJsonRpcIncoming(msg: unknown): msg is {
  id?: number | string | null;
  method?: string;
  result?: unknown;
  error?: { message?: string };
} {
  return typeof msg === "object" && msg !== null;
}

function parseInitializeResult(result: unknown): {
  capabilities: Record<string, unknown>;
  serverInfo?: { name?: string; version?: string };
} {
  if (result === null || typeof result !== "object") {
    return { capabilities: {} };
  }
  const r = result as Record<string, unknown>;
  const caps = r.capabilities;
  const capabilities =
    caps !== undefined && caps !== null && typeof caps === "object" && !Array.isArray(caps)
      ? { ...(caps as Record<string, unknown>) }
      : {};
  const si = r.serverInfo;
  if (si !== undefined && si !== null && typeof si === "object" && !Array.isArray(si)) {
    const o = si as Record<string, unknown>;
    const serverInfo: { name?: string; version?: string } = {};
    if (typeof o.name === "string") serverInfo.name = o.name;
    if (typeof o.version === "string") serverInfo.version = o.version;
    return { capabilities, serverInfo };
  }
  return { capabilities };
}

/** Stdio MCP transport — auto-detects NDJSON vs Content-Length framing. */
export class StdioMcpTransport {
  private subprocess?: ReturnType<typeof execa>;
  private framer = new HybridJsonRpcFramer();
  private nextId = 1;
  private pending = new Map<
    number | string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private serverCapabilities?: Record<string, unknown>;
  private serverInfo?: { name?: string; version?: string };
  private notificationQueue: unknown[] = [];
  private notificationHandler?: (notification: unknown) => void;
  private stderrTail = "";
  private stopped = false;

  constructor(private readonly transport: McpStdioTransport) {}

  async start(startupTimeoutMs = DEFAULT_STARTUP_TIMEOUT_MS): Promise<void> {
    this.stopped = false;
    this.stderrTail = "";
    this.subprocess = execa(this.transport.command, this.transport.args, {
      env: { ...process.env, ...this.transport.env },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      reject: false,
    });

    this.subprocess.stderr?.on("data", (chunk: Buffer) => {
      this.appendStderr(chunk);
    });

    this.subprocess.stdout?.on("data", (chunk: Buffer) => {
      const msgs = this.framer.push(chunk);
      for (const msg of msgs) {
        this.dispatch(msg);
      }
    });

    this.subprocess.once("error", (err: Error) => {
      this.rejectPending(this.formatTransportError("Stdio MCP process failed", err));
    });

    this.subprocess.once("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      this.subprocess = undefined;
      if (this.stopped) return;
      const reason =
        signal !== null
          ? `Stdio MCP process exited with signal ${signal}`
          : `Stdio MCP process exited with code ${code ?? "unknown"}`;
      this.rejectPending(this.formatTransportError(reason));
    });

    try {
      const initResult = await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "kirakira-agent", version: "0.1.0" },
      }, startupTimeoutMs);
      const parsed = parseInitializeResult(initResult);
      this.serverCapabilities = parsed.capabilities;
      this.serverInfo = parsed.serverInfo;
      this.sendNotification("notifications/initialized", {});
    } catch (err) {
      await this.stop();
      throw err;
    }
  }

  private appendStderr(chunk: Buffer): void {
    this.stderrTail = (this.stderrTail + chunk.toString("utf8")).slice(-STDERR_TAIL_MAX);
  }

  private formatTransportError(message: string, cause?: Error): string {
    const command = [this.transport.command, ...this.transport.args].join(" ");
    const causeText = cause ? `: ${cause.message}` : "";
    const stderr = this.stderrTail.trim();
    const stderrText = stderr ? `; stderr: ${stderr.slice(-1_200)}` : "";
    return `${message}${causeText} (${command})${stderrText}`;
  }

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private sendNotification(method: string, params?: unknown): void {
    if (!this.subprocess?.stdin) {
      throw new Error("Stdio MCP transport not started");
    }
    const payload = { jsonrpc: "2.0", method, params };
    this.subprocess.stdin.write(encodeJsonRpcMessage(payload));
  }

  private dispatch(msg: unknown): void {
    if (!isJsonRpcIncoming(msg)) {
      return;
    }
    const rid = msg.id;
    if (rid !== undefined && rid !== null) {
      const p = this.pending.get(rid);
      if (!p) {
        return;
      }
      this.pending.delete(rid);
      if (msg.error) {
        p.reject(new Error(msg.error.message ?? "JSON-RPC error"));
      } else {
        p.resolve(msg.result);
      }
      return;
    }
    this.notificationQueue.push(msg);
    this.notificationHandler?.(msg);
  }

  getServerCapabilities(): Readonly<Record<string, unknown>> | undefined {
    return this.serverCapabilities;
  }

  getServerInfo(): Readonly<{ name?: string; version?: string }> | undefined {
    return this.serverInfo;
  }

  setNotificationHandler(handler?: (notification: unknown) => void): void {
    this.notificationHandler = handler;
  }

  drainNotifications(): unknown[] {
    return this.notificationQueue.splice(0, this.notificationQueue.length);
  }

  async request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    if (!this.subprocess?.stdin) {
      throw new Error("Stdio MCP transport not started");
    }
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    const encoded = encodeJsonRpcMessage(payload);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const result = new Promise<unknown>((resolve, reject) => {
      const clear = () => {
        if (timer !== undefined) {
          clearTimeout(timer);
          timer = undefined;
        }
      };
      this.pending.set(id, {
        resolve: (v) => {
          clear();
          resolve(v);
        },
        reject: (e) => {
          clear();
          reject(e);
        },
      });
      if (timeoutMs !== undefined && timeoutMs > 0) {
        timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(this.formatTransportError(`${method} timed out after ${timeoutMs}ms`)));
        }, timeoutMs);
      }
    });
    try {
      this.subprocess.stdin.write(encoded);
    } catch (err) {
      if (timer !== undefined) clearTimeout(timer);
      this.pending.delete(id);
      throw new Error(
        this.formatTransportError(
          `Failed to write ${method} request`,
          err instanceof Error ? err : undefined,
        ),
      );
    }
    return await result;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.rejectPending("Stdio MCP transport stopped");
    this.subprocess?.kill();
    this.subprocess = undefined;
    this.notificationQueue.length = 0;
    this.serverCapabilities = undefined;
    this.serverInfo = undefined;
  }
}
