import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { webProviderFromSources } from "../../../packages/deep-research/src/index.js";

let server: Server | undefined;

async function startServer(): Promise<string> {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/evidence") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`
        <html>
          <head><title>MCP Gateway Evidence</title></head>
          <body>
            <main>
              <p>MCP gateway evidence records tool calls with citations.</p>
              <p>Deep research can cite this web document.</p>
            </main>
          </body>
        </html>
      `);
      return;
    }
    if (url.pathname === "/irrelevant") {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("Unrelated release notes.");
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

describe("web research source adapter", () => {
  it("fetches configured web sources and emits citations without a hardcoded search provider", async () => {
    const baseUrl = await startServer();
    const adapter = webProviderFromSources({
      sources: [
        `${baseUrl}/irrelevant`,
        (request) => [`${baseUrl}/evidence?task=${request.taskId}`],
      ],
      allowedProtocols: ["http:"],
      retrievedAt: "2026-06-10T00:00:00.000Z",
    });

    const evidence = await adapter.search({
      taskId: "research-web",
      query: "MCP gateway citations",
      sourceKind: "web",
      limits: { maxDepth: 3, maxBreadth: 2, maxToolCalls: 4 },
      requireCitations: true,
    });

    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      sourceKind: "web",
      title: "MCP Gateway Evidence",
      citations: [
        expect.objectContaining({
          sourceKind: "web",
          uri: `${baseUrl}/evidence?task=research-web`,
          retrievedAt: "2026-06-10T00:00:00.000Z",
          sourceRecordId: `${baseUrl}/evidence?task=research-web`,
        }),
      ],
      metadata: expect.objectContaining({
        status: 200,
        matchedTokens: ["mcp", "gateway", "citations"],
      }),
    });
    expect(evidence[0]?.content).toContain("MCP gateway evidence records tool calls with citations.");
  });

  it("rejects protocols that are not explicitly allowed", async () => {
    const baseUrl = await startServer();
    const adapter = webProviderFromSources({
      sources: [`${baseUrl}/evidence`],
    });

    await expect(
      adapter.search({
        taskId: "research-web",
        query: "MCP gateway citations",
        sourceKind: "web",
        limits: { maxDepth: 3, maxBreadth: 2, maxToolCalls: 4 },
        requireCitations: true,
      }),
    ).rejects.toThrow(/protocol is not allowed/);
  });
});
