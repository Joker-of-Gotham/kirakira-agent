import { describe, expect, it } from "vitest";
import { McpAuditCache } from "../../../packages/mcp-adapter/src/audit.js";
import type { McpServerConfig } from "@kirakira/core";

function makeConfig(name: string): McpServerConfig {
  return {
    name,
    transport: { kind: "stdio", command: "node", args: ["server.js"] },
    auth: { mode: "none" },
    trust: "untrusted",
  };
}

describe("McpAuditCache", () => {
  it("detects first-use for new servers", () => {
    const cache = new McpAuditCache();
    const cfg = makeConfig("test-server");
    expect(cache.isFirstUse(cfg)).toBe(true);
  });

  it("records first use and generates fingerprint", () => {
    const cache = new McpAuditCache();
    const cfg = makeConfig("test-server");
    const fp = cache.recordFirstUse(cfg);
    expect(fp.serverName).toBe("test-server");
    expect(fp.configHash).toHaveLength(16);
    expect(fp.connectionCount).toBe(1);
    expect(fp.approvedAt).toBeDefined();
    expect(cache.isFirstUse(cfg)).toBe(false);
  });

  it("detects config changes", () => {
    const cache = new McpAuditCache();
    const cfg1 = makeConfig("server");
    cache.recordFirstUse(cfg1);

    const cfg2: McpServerConfig = {
      ...cfg1,
      transport: { kind: "http", url: "https://example.com/mcp" },
    };
    expect(cache.hasConfigChanged(cfg2)).toBe(true);
  });

  it("records connections and increments count", () => {
    const cache = new McpAuditCache();
    const cfg = makeConfig("server");
    cache.recordFirstUse(cfg);
    cache.recordConnection("server", "connect");
    cache.recordConnection("server", "connect");

    const fp = cache.getFingerprint("server");
    expect(fp?.connectionCount).toBe(3);
  });

  it("caches and retrieves tool schemas", () => {
    const cache = new McpAuditCache();
    const schema = { type: "object", properties: { path: { type: "string" } } };
    cache.cacheToolSchema("server", "read_file", schema);

    const cached = cache.getCachedToolSchema("server", "read_file");
    expect(cached?.schema).toEqual(schema);
    expect(cached?.serverName).toBe("server");

    expect(cache.getCachedToolSchema("server", "nonexistent")).toBeUndefined();
  });

  it("tracks tool list updates", () => {
    const cache = new McpAuditCache();
    cache.recordFirstUse(makeConfig("server"));
    cache.updateToolList("server", ["read_file", "write_file", "search"]);

    const fp = cache.getFingerprint("server");
    expect(fp?.lastToolList).toEqual(["read_file", "write_file", "search"]);
  });
});
