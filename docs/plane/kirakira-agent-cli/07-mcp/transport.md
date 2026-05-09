# MCP transports

Transport kinds are enumerated in **`mcpTransportSchema`** (`packages/core/src/schemas/mcp.ts`) and **`MCP_TRANSPORTS`** (`packages/core/src/constants.ts`): `stdio`, `http`, `sse_legacy`.

## stdio

Schema fields:

- `kind: "stdio"`
- `command` (string)
- `args` (string[])
- optional `env` map

Implementation: `packages/mcp-adapter/src/transports/stdio.ts` — launches subprocess and frames JSON-RPC.

## HTTP (streamable)

Schema fields:

- `kind: "http"`
- `url` (URL string)
- optional `headers`

Implementation: `packages/mcp-adapter/src/transports/http.ts` — preferred remote transport.

## SSE legacy

Schema fields:

- `kind: "sse_legacy"`
- `url`, optional `headers`

Implementation: `packages/mcp-adapter/src/transports/sse-legacy.ts` — logs deprecation warning and throws (`sse_legacy transport is not implemented; migrate to HTTP MCP.`).

## Choosing a transport

- **Local tools / language servers** → `stdio`
- **Hosted MCP** → `http`
- **Legacy endpoints** → migrate; policy may require `"ask"` via `allowLegacySse` in `policy.yaml`

Client-level timeouts: `timeout.ts`; errors bubble as `McpError` subclasses (`packages/core/src/errors.ts`).
