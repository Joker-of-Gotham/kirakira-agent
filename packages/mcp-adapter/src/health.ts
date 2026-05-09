import type {
  McpHealthResult,
  McpServerConfig,
  McpToolInfo,
} from "@kirakira/core";

import type { McpClientManager } from "./client.js";
import { getTimeoutMs, withTimeout } from "./timeout.js";

function extractToolsResult(result: unknown): McpToolInfo[] {
  if (
    typeof result === "object" &&
    result !== null &&
    "tools" in result &&
    Array.isArray((result as { tools: unknown }).tools)
  ) {
    return (result as { tools: McpToolInfo[] }).tools;
  }
  if (
    typeof result === "object" &&
    result !== null &&
    "result" in result &&
    typeof (result as { result: unknown }).result === "object" &&
    (result as { result: { tools?: unknown } }).result !== null
  ) {
    const inner = (result as { result: { tools?: McpToolInfo[] } }).result;
    return Array.isArray(inner.tools) ? inner.tools : [];
  }
  return [];
}

/** Run a shallow health check: `tools/list` per connected server. */
export async function checkServersHealth(
  manager: McpClientManager,
  servers: readonly McpServerConfig[],
  fallbacks: { startupSec: number; toolSec: number } = {
    startupSec: 30,
    toolSec: 60,
  },
): Promise<McpHealthResult[]> {
  const out: McpHealthResult[] = [];
  for (const cfg of servers) {
    const t0 = Date.now();
    const ms = getTimeoutMs(cfg.timeouts, "tool", fallbacks);
    try {
      const raw = await withTimeout(
        manager.request(cfg.name, "tools/list", {}),
        ms,
        `tools/list:${cfg.name}`,
      );
      const tools = extractToolsResult(raw);
      out.push({
        server: cfg.name,
        healthy: true,
        toolCount: tools.length,
        latencyMs: Date.now() - t0,
      });
    } catch (e) {
      out.push({
        server: cfg.name,
        healthy: false,
        latencyMs: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}
