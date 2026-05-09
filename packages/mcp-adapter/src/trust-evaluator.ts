/**
 * MCP server trust tier derivation for PDP context and prompting.
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type McpTrustTier = "trusted" | "verified" | "community" | "unknown";

export interface McpServerTrustRecord {
  name: string;
  tier: McpTrustTier;
  fingerprint?: string;
  verifiedAt?: string;
}

function isHttpsUrl(serverUrl?: string): boolean {
  if (typeof serverUrl !== "string" || serverUrl.length === 0) return false;
  try {
    return new URL(serverUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function loadTrustRegistry(): Map<string, McpServerTrustRecord> {
  const registryPath = join(process.env.HOME ?? homedir(), ".kirakira", "mcp-trust-registry.json");
  const registry = new Map<string, McpServerTrustRecord>();
  if (!existsSync(registryPath)) return registry;
  try {
    const data = JSON.parse(readFileSync(registryPath, "utf-8")) as { servers?: unknown };
    if (Array.isArray(data.servers)) {
      for (const s of data.servers) {
        if (typeof s === "object" && s !== null && typeof (s as { name?: unknown }).name === "string") {
          registry.set((s as McpServerTrustRecord).name, s as McpServerTrustRecord);
        }
      }
    }
  } catch {
    /* registry unreadable, treat all as unknown */
  }
  return registry;
}

export class McpTrustEvaluator {
  private readonly approved: ReadonlySet<string>;
  private readonly seen = new Set<string>();
  private readonly persistedRegistry: Map<string, McpServerTrustRecord>;

  constructor(approvedServers: readonly string[]) {
    this.approved = new Set(approvedServers);
    this.persistedRegistry = loadTrustRegistry();
  }

  evaluate(serverName: string, serverUrl?: string): McpTrustTier {
    if (this.approved.has(serverName)) {
      return "trusted";
    }

    const persisted = this.persistedRegistry.get(serverName);
    if (persisted && persisted.tier === "trusted") {
      return "trusted";
    }
    if (persisted && persisted.tier === "verified") {
      return "verified";
    }

    if (isHttpsUrl(serverUrl)) {
      return "verified";
    }

    if (persisted && persisted.tier === "community") {
      return "community";
    }
    if (this.seen.has(serverName)) {
      return "community";
    }

    return "unknown";
  }

  isFirstUse(serverName: string): boolean {
    return !this.seen.has(serverName) && !this.persistedRegistry.has(serverName);
  }

  markSeen(serverName: string): void {
    this.seen.add(serverName);
  }

  getTrustRecord(serverName: string): McpServerTrustRecord | undefined {
    return this.persistedRegistry.get(serverName);
  }
}
