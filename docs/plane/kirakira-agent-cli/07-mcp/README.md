# MCP adapter (`@kirakira/mcp-adapter`)

The MCP package wires the CLI to **Model Context Protocol** servers: process **stdio**, **streamable HTTP**, and **legacy SSE** (deprecated), with auth modes **none**, **bearer**, **oauth**, **env**.

## Source layout

| File | Responsibility |
|------|----------------|
| `packages/mcp-adapter/src/index.ts` | Public exports |
| `client.ts` | Session client façade |
| `config-parser.ts` | Parse `.mcp.json` / manifest shapes |
| `health.ts` | Probe readiness |
| `transports/stdio.ts` | Local subprocess JSON-RPC |
| `transports/http.ts` | HTTP transport |
| `transports/sse-legacy.ts` | Deprecated SSE transport — warns and guides migration to HTTP |
| `auth/oauth.ts`, `auth/bearer.ts`, `auth/env.ts` | Credential resolution |
| `tool-filter.ts` | Allow/deny tool lists |
| `timeout.ts` | Request timeouts |

## Schemas (`@kirakira/core`)

Interoperable contracts: `mcpConfigFileSchema`, `mcpServerConfigSchema`, `mcpTransportSchema`, `mcpAuthSchema` — `packages/core/src/schemas/mcp.ts`. Constants: `MCP_TRANSPORTS` in `packages/core/src/constants.ts`.

## CLI integration

MCP subcommands: `packages/cli/src/commands/mcp/*`. Policy knobs: `policy.yaml` `mcp.*` (`packages/core/src/schemas/config.ts`).

## Related docs

- [Transport layers](./transport.md)
- [Config](./config.md)
- [Auth](./auth.md)
- [Migration](./migration.md)
