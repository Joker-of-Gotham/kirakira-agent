import { describe, expect, it } from "vitest";
import {
  createMcpDirectoryView,
  createMcpToolPlaygroundView,
} from "../../../packages/frontend-core/src/index.js";
import type {
  RuntimeMcpListResult,
  RuntimeMcpToolCallResult,
} from "@kirakira/runtime-contracts";

describe("frontend-core MCP tool playground view", () => {
  const discovery: RuntimeMcpListResult = {
    generatedAt: "2026-06-09T12:15:00.000Z",
    servers: [
      {
        name: "workspace",
        health: "healthy",
        trust: {
          tier: "verified",
          source: "registry",
          trustedAnnotations: true,
          firstUse: false,
          transportKind: "stdio",
        },
        policy: {
          decision: "ask",
          source: "pep",
          reasonCodes: ["workspace_write"],
          approvalRequired: true,
          obligations: {
            snapshotRequired: true,
            dryRunRequired: false,
            auditRequired: true,
          },
          decisionId: "decision-1",
          traceId: "trace-1",
        },
        audit: {
          auditRequired: true,
          eventKinds: ["mcp.call.requested", "mcp.call.completed"],
          ledger: "pep",
          decisionId: "decision-1",
        },
        tools: [
          {
            name: "write_note",
            title: "Write note",
            inputSchema: {
              type: "object",
              properties: {
                path: { type: "string", description: "Workspace path" },
                body: { type: "string", default: "draft" },
              },
              required: ["path"],
            },
          },
        ],
      },
    ],
  };

  it("builds editable arguments and inherited metadata rows", () => {
    const tool = createMcpDirectoryView(discovery).tools[0];
    const view = createMcpToolPlaygroundView(tool);

    expect(tool?.trust?.tier).toBe("verified");
    expect(tool?.policy?.decision).toBe("ask");
    expect(tool?.audit?.ledger).toBe("pep");
    expect(view.draft).toMatchObject({
      status: "ready",
      text: JSON.stringify({ path: "" }, null, 2),
      arguments: { path: "" },
    });
    expect(view.trustRows.map((row) => [row.label, row.value])).toContainEqual([
      "Tier",
      "verified",
    ]);
    expect(view.policyRows.map((row) => [row.label, row.value])).toContainEqual([
      "Decision",
      "ask",
    ]);
    expect(view.auditRows.map((row) => [row.label, row.value])).toContainEqual([
      "Ledger",
      "pep",
    ]);
    expect(view.requiresHumanConfirmation).toBe(true);
  });

  it("parses edited JSON object drafts and summarizes call results", () => {
    const tool = createMcpDirectoryView(discovery).tools[0];
    const result: RuntimeMcpToolCallResult = {
      server: "workspace",
      tool: "write_note",
      success: true,
      content: [{ type: "text", text: "ok" }],
      latencyMs: 12,
      policy: {
        effect: "allow",
        reasonCodes: ["approved"],
        approvalRequired: false,
        traceId: "trace-2",
      },
      audit: {
        auditRequired: true,
        eventKinds: ["mcp.call.completed"],
        ledger: "pep",
      },
    };

    const view = createMcpToolPlaygroundView(
      tool,
      JSON.stringify({ path: "notes/today.md", body: "hello" }),
      result,
    );

    expect(view.draft.arguments).toEqual({ path: "notes/today.md", body: "hello" });
    expect(view.callSummary).toMatchObject({
      status: "success",
      title: "Call complete",
      detail: "workspace:write_note",
    });
    expect(view.callSummary?.rows.map((row) => [row.label, row.value])).toContainEqual([
      "Policy",
      "allow",
    ]);
  });

  it("rejects non-object argument drafts", () => {
    const tool = createMcpDirectoryView(discovery).tools[0];
    const view = createMcpToolPlaygroundView(tool, "[]");

    expect(view.draft.status).toBe("invalid");
    expect(view.draft.error).toContain("JSON object");
  });

  it("does not require human confirmation for trusted allowlisted read-only tools", () => {
    const safeTool = createMcpDirectoryView({
      generatedAt: "2026-06-10T00:00:00.000Z",
      servers: [
        {
          name: "docs",
          health: "healthy",
          trust: {
            tier: "trusted",
            source: "config",
            trustedAnnotations: true,
            firstUse: false,
          },
          policy: {
            decision: "allow",
            source: "gateway-rule",
            reasonCodes: [],
            approvalRequired: false,
            obligations: {
              snapshotRequired: false,
              dryRunRequired: false,
              auditRequired: false,
            },
          },
          tools: [{ name: "search", inputSchema: { type: "object" } }],
        },
      ],
    }).tools[0];

    expect(createMcpToolPlaygroundView(safeTool).requiresHumanConfirmation).toBe(false);
  });
});
