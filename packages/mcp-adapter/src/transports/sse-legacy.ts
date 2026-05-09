import type { McpSseLegacyTransport } from "@kirakira/core";

/**
 * Legacy SSE MCP transport — bridges the deprecated SSE protocol by
 * POSTing JSON-RPC requests and reading the response from the SSE endpoint.
 *
 * Per MCP spec the SSE transport is superseded by Streamable HTTP.
 * This adapter enables backward compatibility with older MCP servers
 * that only expose the SSE endpoint.
 */
export class SseLegacyMcpTransport {
  private static _seq = 0;
  private _warned = false;
  private _abortController: AbortController | null = null;

  constructor(private readonly transport: McpSseLegacyTransport) {}

  logMigrationWarning(): void {
    if (this._warned) return;
    this._warned = true;
    process.stderr.write(
      `[@kirakira/mcp-adapter] sse_legacy transport for ${this.transport.url} is deprecated. ` +
        `Migrate to a Streamable HTTP MCP endpoint (transport kind "http").\n`,
    );
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    this.logMigrationWarning();

    const url = this.transport.url.replace(/\/$/, "");
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: ++SseLegacyMcpTransport._seq,
      method,
      params: params ?? {},
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.transport.headers) {
      for (const [k, v] of Object.entries(this.transport.headers)) {
        headers[k] = v;
      }
    }

    this._abortController = new AbortController();
    const res = await fetch(url, { method: "POST", headers, body, signal: this._abortController.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `SSE legacy transport POST failed: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 500)}` : ""}`,
      );
    }

    const json = (await res.json()) as {
      result?: unknown;
      error?: { code: number; message: string; data?: unknown };
    };

    if (json.error) {
      throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    }

    this._abortController = null;
    return json.result;
  }

  close(): void {
    this._abortController?.abort();
    this._abortController = null;
  }
}
