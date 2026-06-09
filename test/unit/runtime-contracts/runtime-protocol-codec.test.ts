import { describe, expect, it, vi } from "vitest";
import {
  RuntimeRequestTracker,
  makeRuntimeProtocolError,
  parseRuntimeArtifactContentAckResult,
  parseRuntimeClientMessage,
  parseRuntimeMcpListAckResult,
  parseRuntimeMcpToolCallAckResult,
  parseRuntimeServerMessage,
  parseRuntimeStateSnapshotAckResult,
  parseRuntimeSubmitAckResult,
  parseRuntimeVoidAckResult,
} from "../../../packages/runtime-contracts/src/index.js";

describe("runtime protocol codec", () => {
  it("validates client messages semantically and preserves request ids on errors", () => {
    expect(
      parseRuntimeClientMessage({
        type: "control",
        messageId: "submit-1",
        message: { type: "submit", prompt: "Map runtime", mode: "headless" },
      }),
    ).toMatchObject({ ok: true });

    expect(
      parseRuntimeClientMessage({
        type: "control",
        messageId: "bad-1",
        message: { type: "inspect" },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_control",
        message: "control message is malformed or unsupported",
        messageId: "bad-1",
        details: { type: "inspect" },
      },
    });

    expect(
      parseRuntimeClientMessage({
        type: "subscribe",
        messageId: "sub-1",
        runId: "run-1",
        filter: { kinds: ["not.real"] },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_filter", messageId: "sub-1" },
    });

    expect(
      parseRuntimeClientMessage({
        type: "get_status",
        messageId: "status-1",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_message", messageId: "status-1" },
    });

    expect(
      parseRuntimeClientMessage({
        type: "get_artifact",
        messageId: "artifact-1",
        runId: "run-1",
        artifactId: "artifact-a",
        maxBytes: 4096,
      }),
    ).toEqual({
      ok: true,
      message: {
        type: "get_artifact",
        messageId: "artifact-1",
        runId: "run-1",
        artifactId: "artifact-a",
        maxBytes: 4096,
      },
    });

    expect(
      parseRuntimeClientMessage({
        type: "get_artifact",
        messageId: "artifact-bad",
        runId: "run-1",
        artifactId: "artifact-a",
        maxBytes: -1,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_message", messageId: "artifact-bad" },
    });

    expect(
      parseRuntimeClientMessage({
        type: "mcp_call",
        messageId: "mcp-1",
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceId: "trace-1",
        subagentId: "sub-implementer-1",
        role: "implementer",
        requestedLane: "delegated",
      }),
    ).toEqual({
      ok: true,
      message: {
        type: "mcp_call",
        messageId: "mcp-1",
        server: "filesystem-core",
        tool: "read_file",
        arguments: { path: "README.md" },
        runId: "run-1",
        traceId: "trace-1",
        subagentId: "sub-implementer-1",
        role: "implementer",
        requestedLane: "delegated",
      },
    });

    expect(
      parseRuntimeClientMessage({
        type: "mcp_call",
        messageId: "mcp-bad",
        server: "filesystem-core",
        tool: "read_file",
        arguments: ["README.md"],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_message", messageId: "mcp-bad" },
    });

    expect(
      parseRuntimeClientMessage({
        type: "mcp_list",
        messageId: "mcp-list-1",
        server: "filesystem-core",
        includeTools: true,
        startServers: true,
      }),
    ).toEqual({
      ok: true,
      message: {
        type: "mcp_list",
        messageId: "mcp-list-1",
        server: "filesystem-core",
        includeTools: true,
        startServers: true,
      },
    });

    expect(
      parseRuntimeClientMessage({
        type: "mcp_list",
        messageId: "mcp-list-bad",
        includeTools: "yes",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_message", messageId: "mcp-list-bad" },
    });
  });

  it("validates server messages and builds correlated protocol errors", () => {
    expect(parseRuntimeServerMessage({ type: "ack" })).toBeNull();
    expect(
      parseRuntimeServerMessage({
        type: "error",
        code: "unknown_run",
        message: "Run not found",
        messageId: "state-1",
      }),
    ).toEqual({
      type: "error",
      code: "unknown_run",
      message: "Run not found",
      messageId: "state-1",
    });

    expect(
      parseRuntimeServerMessage({
        type: "artifact_content",
        artifact: {
          runId: "run-1",
          artifactId: "artifact-a",
          path: "artifacts/report.md",
          sizeBytes: 10,
          truncated: false,
          encoding: "utf8",
          content: "preview",
        },
      }),
    ).toMatchObject({
      type: "artifact_content",
      artifact: {
        artifactId: "artifact-a",
        content: "preview",
      },
    });

    expect(
      makeRuntimeProtocolError({
        code: "invalid_control",
        message: "Bad control",
        messageId: "bad-1",
      }),
    ).toEqual({
      type: "error",
      code: "invalid_control",
      message: "Bad control",
      messageId: "bad-1",
    });
  });
});

describe("RuntimeRequestTracker", () => {
  it("rejects only the matching request for correlated errors", async () => {
    const tracker = new RuntimeRequestTracker({ timeoutMs: 10_000 });
    const first = tracker.track("msg-1", "first");
    const second = tracker.track("msg-2", "second");

    expect(
      tracker.handleServerMessage({
        type: "error",
        code: "unknown_run",
        message: "Missing run",
        messageId: "msg-1",
      }),
    ).toBe(true);
    expect(tracker.handleServerMessage({ type: "ack", messageId: "msg-2" })).toBe(true);

    await expect(first).rejects.toThrow("Missing run");
    await expect(second).resolves.toBeUndefined();
  });

  it("keeps pending requests alive for uncorrelated errors and rejects all on close", async () => {
    vi.useFakeTimers();
    const tracker = new RuntimeRequestTracker({ timeoutMs: 1_000 });
    const first = tracker.track("msg-1", "first");

    expect(
      tracker.handleServerMessage({
        type: "error",
        code: "daemon_warning",
        message: "Uncorrelated",
      }),
    ).toBe(false);
    expect(tracker.size).toBe(1);

    tracker.rejectAll(new Error("closed"));
    await expect(first).rejects.toThrow("closed");
    vi.useRealTimers();
  });

  it("resolves correlated ack payloads through typed result parsers", async () => {
    const tracker = new RuntimeRequestTracker({ timeoutMs: 10_000 });
    const submit = tracker.track(
      "submit-1",
      "submit",
      10_000,
      parseRuntimeSubmitAckResult,
    );
    const state = tracker.track(
      "state-1",
      "state",
      10_000,
      parseRuntimeStateSnapshotAckResult,
    );
    const artifact = tracker.track(
      "artifact-1",
      "artifact",
      10_000,
      parseRuntimeArtifactContentAckResult,
    );
    const drain = tracker.track(
      "drain-1",
      "drain",
      10_000,
      parseRuntimeVoidAckResult,
    );
    const mcp = tracker.track(
      "mcp-1",
      "mcp",
      10_000,
      parseRuntimeMcpToolCallAckResult,
    );
    const mcpList = tracker.track(
      "mcp-list-1",
      "mcp-list",
      10_000,
      parseRuntimeMcpListAckResult,
    );

    tracker.handleServerMessage({ type: "ack", messageId: "submit-1", result: { runId: "run-1" } });
    tracker.handleServerMessage({
      type: "ack",
      messageId: "state-1",
      result: {
        runId: "run-1",
        status: "running",
        activeWorkers: [],
        pendingApprovals: [],
        costSummary: { totalCostUsd: 0, totalTokens: 0 },
      },
    });
    tracker.handleServerMessage({
      type: "ack",
      messageId: "artifact-1",
      result: {
        runId: "run-1",
        artifactId: "artifact-1",
        path: "artifacts/report.md",
        sizeBytes: 12,
        truncated: false,
        encoding: "utf8",
        content: "hello",
      },
    });
    tracker.handleServerMessage({ type: "ack", messageId: "drain-1" });
    tracker.handleServerMessage({
      type: "ack",
      messageId: "mcp-1",
      result: {
        server: "filesystem-core",
        tool: "read_file",
        success: true,
        content: [{ type: "text", text: "ok" }],
        latencyMs: 3,
        policy: {
          effect: "allow",
          reasonCodes: ["baseline_read_workspace"],
          approvalRequired: false,
          traceId: "trace-1",
        },
      },
    });
    tracker.handleServerMessage({
      type: "ack",
      messageId: "mcp-list-1",
      result: {
        generatedAt: "2026-06-09T00:00:00.000Z",
        servers: [
          {
            name: "filesystem-core",
            health: "healthy",
            toolCount: 1,
            trust: {
              tier: "unknown",
              source: "first-use",
              trustedAnnotations: false,
              firstUse: true,
              configuredLevel: "untrusted",
              transportKind: "stdio",
              authMode: "none",
            },
            policy: {
              decision: "not_evaluated",
              source: "not-evaluated",
              reasonCodes: [],
              approvalRequired: false,
              obligations: {
                snapshotRequired: false,
                dryRunRequired: false,
                auditRequired: false,
              },
            },
            audit: {
              auditRequired: false,
              eventKinds: ["mcp.discovery"],
              ledger: "none",
            },
            otel: {
              spanName: "mcp.tools/list",
              attributes: {
                "mcp.server.name": "filesystem-core",
                "mcp.operation": "tools/list",
                "mcp.trust.tier": "unknown",
              },
            },
            tools: [
              {
                name: "read_file",
                title: "Read file",
                inputSchema: { type: "object", properties: {} },
                annotations: { readOnlyHint: true },
                trust: {
                  tier: "unknown",
                  source: "first-use",
                  trustedAnnotations: false,
                  firstUse: true,
                  configuredLevel: "untrusted",
                  transportKind: "stdio",
                  authMode: "none",
                },
                policy: {
                  decision: "ask",
                  source: "gateway-default",
                  reasonCodes: ["mcp_gateway_default_ask"],
                  approvalRequired: true,
                  obligations: {
                    snapshotRequired: false,
                    dryRunRequired: false,
                    auditRequired: false,
                  },
                },
                audit: {
                  auditRequired: false,
                  eventKinds: ["mcp.discovery"],
                  ledger: "none",
                },
                otel: {
                  spanName: "mcp.tools/list.read_file",
                  attributes: {
                    "mcp.server.name": "filesystem-core",
                    "mcp.tool.name": "read_file",
                    "mcp.trust.tier": "unknown",
                  },
                },
              },
            ],
          },
        ],
      },
    });

    await expect(submit).resolves.toEqual({ runId: "run-1" });
    await expect(state).resolves.toMatchObject({ runId: "run-1", status: "running" });
    await expect(artifact).resolves.toMatchObject({ artifactId: "artifact-1", content: "hello" });
    await expect(drain).resolves.toBeUndefined();
    await expect(mcp).resolves.toMatchObject({
      server: "filesystem-core",
      tool: "read_file",
      success: true,
    });
    await expect(mcpList).resolves.toMatchObject({
      servers: [
        {
          name: "filesystem-core",
          health: "healthy",
          toolCount: 1,
          trust: { tier: "unknown", trustedAnnotations: false },
          tools: [
            {
              name: "read_file",
              policy: { decision: "ask", source: "gateway-default" },
            },
          ],
        },
      ],
    });
  });

  it("rejects matching requests when typed ack payload parsing fails", async () => {
    const tracker = new RuntimeRequestTracker({ timeoutMs: 10_000 });
    const submit = tracker.track(
      "submit-1",
      "submit",
      10_000,
      parseRuntimeSubmitAckResult,
    );

    expect(
      tracker.handleServerMessage({
        type: "ack",
        messageId: "submit-1",
        result: { id: "run-1" },
      }),
    ).toBe(true);

    await expect(submit).rejects.toThrow("Runtime ack result is not a valid submit result");
  });

  it("rejects malformed MCP discovery metadata", () => {
    expect(() =>
      parseRuntimeMcpListAckResult({
        generatedAt: "2026-06-09T00:00:00.000Z",
        servers: [
          {
            name: "docs",
            health: "healthy",
            trust: {
              tier: "official",
              source: "config",
              trustedAnnotations: true,
              firstUse: false,
            },
          },
        ],
      }),
    ).toThrow("Runtime ack result is not a valid MCP list result");
  });
});
