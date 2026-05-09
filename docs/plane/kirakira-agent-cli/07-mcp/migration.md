# SSE → Streamable HTTP migration

Legacy **Server-Sent Events** MCP endpoints are represented as `kind: "sse_legacy"` in `mcpTransportSchema` (`packages/core/src/schemas/mcp.ts`). The `sse_legacy` transport implementation refuses live requests and prints the migration path:

**File:** `packages/mcp-adapter/src/transports/sse-legacy.ts`

- `logMigrationWarning()` prints a deprecation message naming the server URL.
- `request()` always throws: `"sse_legacy transport is not implemented; migrate to HTTP MCP."`

## Operator checklist

1. **Identify** servers still on SSE via `.mcp.json` / host export files.
2. **Upgrade** server binary or hosted endpoint to **streamable HTTP** (`kind: "http"`).
3. **Update** config URLs and headers; remove `sse_legacy` kind.
4. **Validate** with `kirakira-agent mcp test <name>` (`packages/cli/src/commands/mcp/test.ts`).
5. **Adjust policy** — set `mcp.allowLegacySse` to `deny` in `policy.yaml` once migration completes (`packages/core/src/schemas/config.ts`).

## Why migrate

HTTP transport unifies retries, auth, and observability (`http.ts`, `timeout.ts`) and avoids half-implemented SSE clients that complicate security review.
