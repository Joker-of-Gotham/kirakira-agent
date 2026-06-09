import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpServerConfig } from "@kirakira/core";
import {
  ExportingMcpSpanRecorder,
  InMemoryMcpSpanExporter,
  McpClientManager,
} from "@kirakira/mcp-adapter";
import type { EnforcementResult, McpPep } from "@kirakira/policy-engine";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DaemonMcpRuntime } from "../../../packages/runtime-daemon/src/index.js";

function allowDecision(): EnforcementResult {
  return {
    allowed: true,
    traceId: "policy-trace-live-smoke",
    decision: {
      version: "kirakira.decision.v1",
      decision_id: "decision-live-smoke",
      request_id: "request-live-smoke",
      effect: "allow",
      reason_codes: ["live_mcp_smoke"],
      policy: {
        bundle_id: "smoke",
        revision: "test",
        package: "test",
      },
      approval: {
        required: false,
        mode: "none",
        cacheable: true,
      },
      obligations: [],
      explain: {
        summary: "live smoke policy decision",
        matched_rules: [],
      },
    },
  };
}

function fakePep(): McpPep {
  return {
    enforce: vi.fn(async () => allowDecision()),
  } as unknown as McpPep;
}

const STDIO_FIXTURE_SOURCE = `
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (;;) {
    const index = buffer.indexOf("\\n");
    if (index === -1) break;
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line.length > 0) handle(line);
  }
});

function write(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}

function handle(line) {
  const message = JSON.parse(line);
  if (message.id === undefined || message.id === null) return;
  if (message.method === "initialize") {
    write(message.id, {
      protocolVersion: "2025-11-25",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "kirakira-stdio-smoke", version: "1.0.0" },
    });
    return;
  }
  if (message.method === "tools/list") {
    write(message.id, {
      tools: [{
        name: "echo_context",
        description: "Echo MCP trace metadata",
        inputSchema: { type: "object", additionalProperties: true },
        outputSchema: { type: "object", additionalProperties: true },
      }],
    });
    return;
  }
  if (message.method === "tools/call") {
    write(message.id, {
      content: [{ type: "text", text: JSON.stringify({ meta: message.params?._meta ?? {} }) }],
      structuredContent: {
        meta: message.params?._meta ?? {},
        arguments: message.params?.arguments ?? {},
      },
      isError: false,
    });
  }
}
`;

describe("daemon MCP live propagation smoke", () => {
  const managers: McpClientManager[] = [];
  const cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.allSettled(managers.splice(0).map((manager) => manager.stopAll()));
    await Promise.allSettled(cleanup.splice(0).map((fn) => fn()));
  });

  it("propagates W3C trace metadata through live stdio and HTTP MCP transports", async () => {
    const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-mcp-live-smoke-"));
    cleanup.push(() => rm(workspaceRoot, { recursive: true, force: true }));
    const stdioFixture = join(workspaceRoot, "stdio-fixture.mjs");
    await writeFile(stdioFixture, STDIO_FIXTURE_SOURCE, "utf8");

    const httpRequests: Array<Record<string, unknown>> = [];
    const httpServer = createServer(async (req, res) => {
      const body = await readRequestJson(req);
      httpRequests.push(body);
      writeJsonRpcResponse(res, body);
    });
    const httpUrl = await listenOnRandomPort(httpServer);
    cleanup.push(
      () =>
        new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        }),
    );

    const manager = new McpClientManager();
    managers.push(manager);
    manager.registerServer({
      name: "stdio-live",
      transport: {
        kind: "stdio",
        command: process.execPath,
        args: [stdioFixture],
      },
      auth: { mode: "none" },
      trust: "user-approved",
    } satisfies McpServerConfig);
    manager.registerServer({
      name: "http-live",
      transport: {
        kind: "http",
        url: httpUrl,
      },
      auth: { mode: "none" },
      trust: "user-approved",
    } satisfies McpServerConfig);

    const exporter = new InMemoryMcpSpanExporter();
    const runtime = new DaemonMcpRuntime({
      workspaceRoot,
      mcpManager: manager,
      mcpPep: fakePep(),
      mcpSpanRecorder: new ExportingMcpSpanRecorder(exporter),
      userId: "smoke-user",
    });
    const traceContext = {
      traceparent: "00-1234567890abcdef1234567890abcdef-1111111111111111-01",
      tracestate: "vendor=smoke",
      baggage: "tenant=kirakira,run=smoke",
    };

    try {
      for (const server of ["stdio-live", "http-live"] as const) {
        const listed = await runtime.listTools({
          server,
          includeTools: true,
          startServers: true,
          traceContext,
        });
        expect(listed.servers[0]).toMatchObject({
          name: server,
          health: "healthy",
          tools: [expect.objectContaining({ name: "echo_context" })],
          otel: {
            traceContext: {
              traceparent: expect.stringMatching(
                /^00-1234567890abcdef1234567890abcdef-[0-9a-f]{16}-01$/,
              ),
              tracestate: "vendor=smoke",
              baggage: "tenant=kirakira,run=smoke",
            },
          },
        });

        const called = await runtime.callTool({
          server,
          tool: "echo_context",
          arguments: { value: server },
          runId: "run-live-mcp-smoke",
          traceContext,
        });
        expect(called).toMatchObject({
          server,
          tool: "echo_context",
          success: true,
          isError: false,
          trust: {
            tier: "verified",
            source: "config",
            transportKind: server === "stdio-live" ? "stdio" : "http",
          },
          audit: {
            auditRequired: true,
            ledger: "mcp-audit-bridge",
            decisionId: "decision-live-smoke",
          },
          otel: {
            spanName: "tools/call echo_context",
            traceContext: {
              traceparent: expect.stringMatching(
                /^00-1234567890abcdef1234567890abcdef-[0-9a-f]{16}-01$/,
              ),
              tracestate: "vendor=smoke",
              baggage: "tenant=kirakira,run=smoke",
            },
            attributes: expect.objectContaining({
              "mcp.method.name": "tools/call",
              "mcp.server.name": server,
              "gen_ai.operation.name": "execute_tool",
              "gen_ai.tool.name": "echo_context",
              "mcp.protocol.version": "2025-11-25",
            }),
          },
        });
        expect(called.structuredContent).toMatchObject({
          meta: {
            traceparent: expect.stringMatching(
              /^00-1234567890abcdef1234567890abcdef-[0-9a-f]{16}-01$/,
            ),
            tracestate: "vendor=smoke",
            baggage: "tenant=kirakira,run=smoke",
          },
          arguments: { value: server },
        });
      }

      expect(httpRequests.some((request) => request.method === "tools/call")).toBe(true);
      expect(exporter.spans.map((span) => span.name)).toEqual([
        "tools/list",
        "tools/call echo_context",
        "tools/list",
        "tools/call echo_context",
      ]);
      expect(exporter.spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "tools/call echo_context",
            status: { code: "OK" },
            attributes: expect.objectContaining({
              "mcp.server.name": "stdio-live",
              "network.transport": "pipe",
              "kirakira.policy.decision_id": "decision-live-smoke",
            }),
          }),
          expect.objectContaining({
            name: "tools/call echo_context",
            status: { code: "OK" },
            attributes: expect.objectContaining({
              "mcp.server.name": "http-live",
              "network.transport": "tcp",
              "network.protocol.name": "http",
              "kirakira.policy.decision_id": "decision-live-smoke",
            }),
          }),
        ]),
      );
    } finally {
      await runtime.close();
    }
  });
});

async function readRequestJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function writeJsonRpcResponse(res: ServerResponse, body: Record<string, unknown>): void {
  const id = body.id;
  const method = body.method;
  const params = body.params as Record<string, unknown> | undefined;
  const result = method === "tools/list"
    ? {
        tools: [
          {
            name: "echo_context",
            description: "Echo MCP trace metadata",
            inputSchema: { type: "object", additionalProperties: true },
            outputSchema: { type: "object", additionalProperties: true },
          },
        ],
      }
    : {
        content: [
          {
            type: "text",
            text: JSON.stringify({ meta: params?._meta ?? {} }),
          },
        ],
        structuredContent: {
          meta: params?._meta ?? {},
          arguments: params?.arguments ?? {},
        },
        isError: false,
      };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

async function listenOnRandomPort(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("HTTP MCP smoke server did not expose a TCP address");
  }
  return `http://127.0.0.1:${address.port}/mcp`;
}
