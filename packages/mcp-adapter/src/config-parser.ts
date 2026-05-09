import {
  mcpConfigFileSchema,
  type McpServerConfig,
  type McpServerEntry,
} from "@kirakira/core";

function normalizeServer(name: string, entry: McpServerEntry): McpServerConfig {
  const type = entry.type?.toLowerCase() ?? "";

  if (entry.command) {
    return {
      name,
      transport: {
        kind: "stdio",
        command: entry.command,
        args: entry.args ?? [],
        ...(entry.env !== undefined ? { env: entry.env } : {}),
      },
      auth: { mode: "none" },
      tools: entry.tools?.length
        ? { enabled: [...entry.tools] }
        : undefined,
      timeouts:
        entry.timeout !== undefined
          ? { startupSec: entry.timeout, toolSec: entry.timeout }
          : undefined,
      trust: "untrusted",
    };
  }

  if (entry.url) {
    const isSse =
      type === "sse" ||
      type === "sse_legacy" ||
      type === "legacy-sse" ||
      entry.url.endsWith("/sse");

    if (isSse) {
      return {
        name,
        transport: {
          kind: "sse_legacy",
          url: entry.url,
          ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
        },
        auth: { mode: "none" },
        tools: entry.tools?.length
          ? { enabled: [...entry.tools] }
          : undefined,
        timeouts:
          entry.timeout !== undefined
            ? { startupSec: entry.timeout, toolSec: entry.timeout }
            : undefined,
        trust: "untrusted",
      };
    }

    return {
      name,
      transport: {
        kind: "http",
        url: entry.url,
        ...(entry.headers !== undefined ? { headers: entry.headers } : {}),
      },
      auth: { mode: "none" },
      tools: entry.tools?.length
        ? { enabled: [...entry.tools] }
        : undefined,
      timeouts:
        entry.timeout !== undefined
          ? { startupSec: entry.timeout, toolSec: entry.timeout }
          : undefined,
      trust: "untrusted",
    };
  }

  throw new Error(`MCP server "${name}" needs command or url`);
}

/** Parse `.mcp.json` text into normalized `McpServerConfig[]`. */
export function parseMcpConfigJson(jsonText: string): McpServerConfig[] {
  const raw: unknown = JSON.parse(jsonText);
  const parsed = mcpConfigFileSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid MCP config: ${msg}`);
  }

  return Object.entries(parsed.data.mcpServers).map(([name, entry]) =>
    normalizeServer(name, entry),
  );
}
