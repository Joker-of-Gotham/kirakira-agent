# Deep research web source adapter

Date: 2026-06-10

## Scope

- Added a configurable `web` research source adapter in
  `@kirakira/deep-research`.
- The adapter accepts explicit URLs or a request-aware URL resolver instead of
  hardcoding a search provider.
- It defaults to HTTPS-only sources, supports explicit protocol allowlists for
  controlled local/integration tests, fetches text-like content, strips basic
  HTML, and emits URL citations.
- Added a local HTTP-server unit test so web adapter behavior is exercised
  without depending on external network state.

## External references

- Node.js global `fetch` API:
  <https://nodejs.org/api/globals.html#fetch>
- Fetch API overview:
  <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API>
- MCP Tools specification 2025-11-25:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/deep-research/web.test.ts test/unit/deep-research/file.test.ts test/unit/deep-research/planner.test.ts
pnpm.cmd --filter @kirakira/deep-research typecheck
pnpm.cmd --filter @kirakira/deep-research build
```

Remaining roadmap work:

- Concrete live adapter suite for MCP source kind.
- End-to-end live research gates that run file, web, and MCP adapters through
  daemon and workbench surfaces.
