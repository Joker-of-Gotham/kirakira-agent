import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpServerConfig } from "../../packages/core/src/index.js";
import type { McpResearchToolTarget } from "../../packages/deep-research/src/index.js";
import {
  ExportingMcpSpanRecorder,
  InMemoryMcpSpanExporter,
  McpClientManager,
} from "../../packages/mcp-adapter/src/index.js";
import type { EnforcementResult, McpPep } from "../../packages/policy-engine/src/index.js";
import { DaemonMcpRuntime } from "../../packages/runtime-daemon/src/index.js";

export const DEEP_RESEARCH_LIVE_MCP_TOOL = "collect_research_evidence";
export const DEEP_RESEARCH_STDIO_SERVER = "deep-research-stdio-live";
export const DEEP_RESEARCH_HTTP_SERVER = "deep-research-http-live";
export const DEEP_RESEARCH_LIVE_RETRIEVED_AT = "2026-06-10T00:00:00.000Z";

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
      serverInfo: { name: "kirakira-deep-research-stdio-smoke", version: "1.0.0" }
    });
    return;
  }
  if (message.method === "tools/list") {
    write(message.id, { tools: [tool("${DEEP_RESEARCH_LIVE_MCP_TOOL}")] });
    return;
  }
  if (message.method === "tools/call") {
    write(message.id, resultFor("stdio", message.params));
  }
}

function tool(name) {
  return {
    name,
    description: "Return structured deep research evidence",
    inputSchema: { type: "object", additionalProperties: true },
    outputSchema: { type: "object", additionalProperties: true }
  };
}

function resultFor(source, params) {
  const query = params?.arguments?.query ?? "unknown query";
  return {
    content: [{ type: "text", text: JSON.stringify({ source, query }) }],
    structuredContent: {
      evidence: [{
        title: source + " MCP research evidence",
        summary: "Live " + source + " MCP tool returned citation-ready evidence.",
        content: "Deep research can cite " + source + " MCP tool output for " + query + ".",
        confidence: 0.91,
        citations: [{
          id: source + "-citation",
          title: source + " MCP source",
          uri: "mcp+smoke://" + source + "/research-evidence",
          score: 10
        }]
      }]
    },
    isError: false
  };
}
`;

export interface DeepResearchLiveMcpFixture {
  workspaceRoot: string;
  manager: McpClientManager;
  runtime: DaemonMcpRuntime;
  exporter: InMemoryMcpSpanExporter;
  httpRequests: Array<Record<string, unknown>>;
  targets: McpResearchToolTarget[];
  close: () => Promise<void>;
}

export async function startDeepResearchLiveMcpFixture(): Promise<DeepResearchLiveMcpFixture> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "kirakira-deep-research-live-"));
  const stdioFixture = join(workspaceRoot, "stdio-fixture.mjs");
  await writeFile(stdioFixture, STDIO_FIXTURE_SOURCE, "utf8");

  const httpRequests: Array<Record<string, unknown>> = [];
  const httpServer = createServer(async (req, res) => {
    const body = await readRequestJson(req);
    httpRequests.push(body);
    writeJsonRpcResponse(res, body);
  });
  const httpUrl = await listenOnRandomPort(httpServer);

  const manager = new McpClientManager();
  manager.registerServer({
    name: DEEP_RESEARCH_STDIO_SERVER,
    transport: {
      kind: "stdio",
      command: process.execPath,
      args: [stdioFixture],
    },
    auth: { mode: "none" },
    trust: "user-approved",
  } satisfies McpServerConfig);
  manager.registerServer({
    name: DEEP_RESEARCH_HTTP_SERVER,
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
    userId: "deep-research-smoke",
  });

  return {
    workspaceRoot,
    manager,
    runtime,
    exporter,
    httpRequests,
    targets: deepResearchLiveMcpTargets(),
    async close() {
      await Promise.allSettled([
        runtime.close(),
        manager.stopAll(),
        new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        }),
      ]);
      await rm(workspaceRoot, { recursive: true, force: true });
    },
  };
}

export function deepResearchLiveMcpTargets(): McpResearchToolTarget[] {
  return [
    {
      server: DEEP_RESEARCH_STDIO_SERVER,
      tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
      metadata: { liveTransport: "stdio" },
    },
    {
      server: DEEP_RESEARCH_HTTP_SERVER,
      tool: DEEP_RESEARCH_LIVE_MCP_TOOL,
      metadata: { liveTransport: "http" },
    },
  ];
}

function allowDecision(): EnforcementResult {
  return {
    allowed: true,
    traceId: "policy-trace-deep-research-live",
    decision: {
      version: "kirakira.decision.v1",
      decision_id: "decision-deep-research-live",
      request_id: "request-deep-research-live",
      effect: "allow",
      reason_codes: ["deep_research_live_mcp"],
      policy: {
        bundle_id: "deep-research-live",
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
        summary: "deep research live MCP smoke decision",
        matched_rules: [],
      },
    },
  };
}

function fakePep(): McpPep {
  return {
    enforce: async () => allowDecision(),
  } as unknown as McpPep;
}

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
  const result = method === "initialize"
    ? {
        protocolVersion: "2025-11-25",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "kirakira-deep-research-http-smoke", version: "1.0.0" },
      }
    : method === "tools/list"
      ? {
          tools: [
            {
              name: DEEP_RESEARCH_LIVE_MCP_TOOL,
              description: "Return structured deep research evidence",
              inputSchema: { type: "object", additionalProperties: true },
              outputSchema: { type: "object", additionalProperties: true },
            },
          ],
        }
      : {
          content: [
            {
              type: "text",
              text: JSON.stringify({ source: "http", query: params?.arguments }),
            },
          ],
          structuredContent: {
            evidence: [
              {
                title: "http MCP research evidence",
                summary: "Live http MCP tool returned citation-ready evidence.",
                content: "Deep research can cite http MCP tool output.",
                confidence: 0.92,
                citations: [
                  {
                    id: "http-citation",
                    title: "http MCP source",
                    uri: "mcp+smoke://http/research-evidence",
                    score: 10,
                  },
                ],
              },
            ],
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
