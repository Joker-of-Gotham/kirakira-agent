import type { McpHttpTransport } from "@kirakira/core";

let _httpSeq = 0;

/** HTTP transport for Streamable HTTP MCP endpoints. */
export class HttpMcpTransport {
  private _abortController: AbortController | null = null;

  constructor(private readonly transport: McpHttpTransport) {}

  async request(method: string, params?: unknown): Promise<unknown> {
    this._abortController = new AbortController();
    const res = await fetch(this.transport.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...this.transport.headers,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++_httpSeq,
        method,
        params,
      }),
      signal: this._abortController.signal,
    });

    if (!res.ok) {
      throw new Error(`MCP HTTP error: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    this._abortController = null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error("MCP HTTP response was not JSON");
    }
  }

  close(): void {
    this._abortController?.abort();
    this._abortController = null;
  }
}
