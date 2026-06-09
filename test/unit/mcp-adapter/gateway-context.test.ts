import { describe, expect, it } from "vitest";

import { McpClientManager } from "../../../packages/mcp-adapter/src/client.js";
import { McpGatewayContextFactory } from "../../../packages/mcp-adapter/src/gateway-context.js";

describe("McpGatewayContextFactory", () => {
  it("derives trust, policy, audit, and OTel metadata from registered server config", () => {
    const manager = new McpClientManager();
    manager.registerServer({
      name: "docs",
      transport: { kind: "http", url: "https://mcp.example.test" },
      auth: { mode: "bearer", clientSecretEnv: "DOCS_MCP_TOKEN" },
      trust: "user-approved",
    });
    const factory = new McpGatewayContextFactory({
      manager,
      toolPolicy: { allow: ["mcp.docs.search"] },
      obligations: { audit_required: ["mcp.docs.search"] },
    });

    const server = factory.serverContext("docs", "tools/list");
    const tool = factory.toolContext("docs", "search", "tools/call", server);

    expect(server.trust).toMatchObject({
      tier: "verified",
      source: "config",
      trustedAnnotations: true,
      configuredLevel: "user-approved",
      transportKind: "http",
      authMode: "bearer",
      serverUrl: "https://mcp.example.test",
      issuer: "mcp.example.test",
    });
    expect(tool).toMatchObject({
      server: "docs",
      tool: "search",
      qualifiedName: "mcp.docs.search",
      policy: {
        decision: "allow",
        source: "gateway-rule",
        reasonCodes: ["mcp_gateway_allow"],
        approvalRequired: false,
        obligations: {
          auditRequired: true,
          dryRunRequired: false,
          snapshotRequired: false,
        },
      },
      audit: {
        auditRequired: true,
        eventKinds: ["policy.decision", "tool.exec", "tool.result"],
        ledger: "mcp-audit-bridge",
      },
      otel: {
        spanName: "mcp.tools/call.search",
        attributes: {
          "mcp.server.name": "docs",
          "mcp.tool.name": "search",
          "mcp.trust.tier": "verified",
          "mcp.transport": "http",
          "gen_ai.operation.name": "tool.call",
        },
      },
    });
  });
});
