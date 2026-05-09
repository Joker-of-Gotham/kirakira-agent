import type { McpAuth, McpServerConfig } from "@kirakira/core";

import { HttpMcpTransport } from "./transports/http.js";
import { SseLegacyMcpTransport } from "./transports/sse-legacy.js";
import { StdioMcpTransport } from "./transports/stdio.js";

function resolveAuthHeaders(auth: McpAuth): Record<string, string> {
  if (auth.mode === "none") return {};
  if (auth.mode === "bearer" || auth.mode === "env") {
    const envVar = auth.clientSecretEnv ?? "MCP_AUTH_TOKEN";
    const token = process.env[envVar];
    if (token) return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export type McpHealthStatus =
  | "stopped"
  | "starting"
  | "healthy"
  | "degraded"
  | "unhealthy";

interface LiveSession {
  request(method: string, params?: unknown): Promise<unknown>;
  stop(): Promise<void>;
}

/** Multi-server MCP manager with start/stop/restart and connection tracking. */
export class McpClientManager {
  private readonly configs = new Map<string, McpServerConfig>();
  private readonly sessions = new Map<string, LiveSession>();
  private readonly healthStatus = new Map<string, McpHealthStatus>();

  registerServer(config: McpServerConfig): void {
    this.configs.set(config.name, config);
    if (!this.healthStatus.has(config.name)) {
      this.healthStatus.set(config.name, "stopped");
    }
  }

  registerMany(configs: readonly McpServerConfig[]): void {
    for (const c of configs) {
      this.registerServer(c);
    }
  }

  getConfig(name: string): McpServerConfig | undefined {
    return this.configs.get(name);
  }

  getHealth(name: string): McpHealthStatus {
    return this.healthStatus.get(name) ?? "stopped";
  }

  listServers(): string[] {
    return [...this.configs.keys()];
  }

  async startServer(name: string): Promise<void> {
    const cfg = this.configs.get(name);
    if (!cfg) {
      throw new Error(`Unknown MCP server: ${name}`);
    }
    this.healthStatus.set(name, "starting");
    const prev = this.sessions.get(name);
    if (prev) {
      await prev.stop();
      this.sessions.delete(name);
    }

    const authHeaders = resolveAuthHeaders(cfg.auth);

    if (cfg.transport.kind === "stdio") {
      const t = new StdioMcpTransport(cfg.transport);
      await t.start();
      this.sessions.set(name, {
        request: (m, p) => t.request(m, p),
        stop: () => t.stop(),
      });
    } else if (cfg.transport.kind === "http") {
      const merged = { ...cfg.transport, headers: { ...cfg.transport.headers, ...authHeaders } };
      const h = new HttpMcpTransport(merged);
      this.sessions.set(name, {
        request: (m, p) => h.request(m, p),
        stop: async () => { h.close(); },
      });
    } else {
      const merged = { ...cfg.transport, headers: { ...cfg.transport.headers, ...authHeaders } };
      const s = new SseLegacyMcpTransport(merged);
      s.logMigrationWarning();
      this.sessions.set(name, {
        request: (m, p) => s.request(m, p),
        stop: async () => { s.close(); },
      });
    }

    this.healthStatus.set(name, "healthy");
  }

  async stopServer(name: string): Promise<void> {
    const s = this.sessions.get(name);
    if (s) {
      await s.stop();
      this.sessions.delete(name);
    }
    this.healthStatus.set(name, "stopped");
  }

  async restartServer(name: string): Promise<void> {
    await this.stopServer(name);
    await this.startServer(name);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((n) => this.stopServer(n)));
  }

  async request(
    serverName: string,
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    const s = this.sessions.get(serverName);
    if (!s) {
      throw new Error(`MCP server not running: ${serverName}`);
    }
    const result = await s.request(method, params);
    if (
      typeof result === "object" &&
      result !== null &&
      "error" in result &&
      (result as { error?: { message?: string } }).error
    ) {
      const err = (result as { error: { message?: string } }).error;
      throw new Error(err.message ?? "JSON-RPC error");
    }
    if (
      typeof result === "object" &&
      result !== null &&
      "result" in result
    ) {
      return (result as { result: unknown }).result;
    }
    return result;
  }
}
