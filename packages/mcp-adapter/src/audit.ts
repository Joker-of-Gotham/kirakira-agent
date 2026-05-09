/**
 * MCP audit and cache layer — server fingerprint tracking, schema snapshots,
 * tool list caching, and connection state auditing.
 *
 * Aligned with kirakira-agent-registry.md §MCP Gateway layer 6: audit and cache.
 */

import { sha256Hex } from "@kirakira/core";
import type { McpServerConfig } from "@kirakira/core";

export interface McpServerFingerprint {
  readonly serverName: string;
  readonly configHash: string;
  readonly lastSeen: string;
  readonly lastToolList: string[];
  readonly connectionCount: number;
  readonly authMode: string;
  readonly transportKind: string;
  readonly approvedAt?: string;
}

export interface McpToolSchemaEntry {
  readonly serverName: string;
  readonly toolName: string;
  readonly schema: Record<string, unknown>;
  readonly cachedAt: string;
}

export class McpAuditCache {
  private fingerprints = new Map<string, McpServerFingerprint>();
  private toolSchemaCache = new Map<string, McpToolSchemaEntry>();
  private connectionLog: Array<{
    serverName: string;
    event: "connect" | "disconnect" | "error" | "restart";
    timestamp: string;
    detail?: string;
  }> = [];

  computeConfigHash(config: McpServerConfig): string {
    const payload = JSON.stringify({
      transport: config.transport,
      auth: config.auth,
    });
    return sha256Hex(payload).slice(0, 16);
  }

  recordFirstUse(config: McpServerConfig): McpServerFingerprint {
    const hash = this.computeConfigHash(config);
    const fp: McpServerFingerprint = {
      serverName: config.name,
      configHash: hash,
      lastSeen: new Date().toISOString(),
      lastToolList: [],
      connectionCount: 1,
      authMode: config.auth?.mode ?? "none",
      transportKind: config.transport.kind,
      approvedAt: new Date().toISOString(),
    };
    this.fingerprints.set(config.name, fp);
    return fp;
  }

  getFingerprint(name: string): McpServerFingerprint | undefined {
    return this.fingerprints.get(name);
  }

  isFirstUse(config: McpServerConfig): boolean {
    return !this.fingerprints.has(config.name);
  }

  hasConfigChanged(config: McpServerConfig): boolean {
    const existing = this.fingerprints.get(config.name);
    if (!existing) return true;
    return existing.configHash !== this.computeConfigHash(config);
  }

  recordConnection(
    name: string,
    event: "connect" | "disconnect" | "error" | "restart",
    detail?: string,
  ): void {
    this.connectionLog.push({
      serverName: name,
      event,
      timestamp: new Date().toISOString(),
      detail,
    });

    const fp = this.fingerprints.get(name);
    if (fp && event === "connect") {
      this.fingerprints.set(name, {
        ...fp,
        lastSeen: new Date().toISOString(),
        connectionCount: fp.connectionCount + 1,
      });
    }
  }

  updateToolList(name: string, tools: string[]): void {
    const fp = this.fingerprints.get(name);
    if (fp) {
      this.fingerprints.set(name, { ...fp, lastToolList: tools });
    }
  }

  cacheToolSchema(
    serverName: string,
    toolName: string,
    schema: Record<string, unknown>,
  ): void {
    const key = `${serverName}:${toolName}`;
    this.toolSchemaCache.set(key, {
      serverName,
      toolName,
      schema,
      cachedAt: new Date().toISOString(),
    });
  }

  getCachedToolSchema(
    serverName: string,
    toolName: string,
  ): McpToolSchemaEntry | undefined {
    return this.toolSchemaCache.get(`${serverName}:${toolName}`);
  }

  getRecentConnections(
    limit = 50,
  ): typeof this.connectionLog {
    return this.connectionLog.slice(-limit);
  }

  listFingerprints(): McpServerFingerprint[] {
    return [...this.fingerprints.values()];
  }

  toJSON(): Record<string, unknown> {
    return {
      fingerprints: Object.fromEntries(this.fingerprints),
      toolSchemaCache: Object.fromEntries(this.toolSchemaCache),
      connectionLogSize: this.connectionLog.length,
    };
  }
}
