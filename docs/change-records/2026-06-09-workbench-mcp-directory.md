# Workbench MCP Directory

Date: 2026-06-09

## Context

Kirakira already had typed `mcp_list` and `mcp_call` runtime contracts, plus
browser and desktop transports that can request live MCP discovery. The shared
workbench still did not expose that state as an operational surface, so tool
health remained hidden behind protocol plumbing.

## References

- MCP lifecycle and capability negotiation:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- EAM MCP adapter reference:
  `reference_project/eam-agent/packages/mcp-adapter/src/*`
- Current transport contract:
  `packages/frontend-core/src/transport.ts`

## Files Changed

- `packages/frontend-core/src/mcp-directory.ts`
- `packages/frontend-core/src/index.ts`
- `packages/frontend-app/src/workbench.tsx`
- `packages/frontend-app/src/styles.css`
- `packages/frontend-app/src/mock-transport.ts`
- `test/unit/frontend-core/mcp-directory.test.ts`
- `docs/upgrade/eam-parity-roadmap.md`

## Implementation

- Added a browser-safe MCP directory view model that derives server health tone,
  discovered tools, tool counts, and input schema statistics from
  `RuntimeMcpListResult`.
- Added a shared web/Electron workbench MCP panel that loads
  `runtime.listMcpTools({ includeTools: true, startServers: false })` after
  connection and provides explicit refresh and scan actions.
- Kept endpoint and server discovery inside the runtime transport. The UI does
  not inspect local MCP config files or hardcode server paths.
- Extended the mock runtime with healthy, degraded, and stopped MCP servers so
  local preview exercises the same directory contract.
- Preserved the current dense workbench visual system: 8px surfaces, semantic
  status accents, keyboard-focusable buttons, and no new decorative styling.

## Verification

- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app build`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd exec vitest run test/unit/frontend-core/mcp-directory.test.ts test/unit/frontend-core/browser-boundary.test.ts test/unit/frontend-core/runtime-capabilities.test.ts test/unit/frontend-core/browser-gateway-transport.test.ts test/unit/desktop/runtime-ipc.test.ts test/unit/web/runtime-config.test.ts`
- Mock web visual check at `http://127.0.0.1:5183/` using headless Chrome:
  `.kirakira/visual-checks/mcp-workbench-1440-built.png`

## Remaining Risks

- This is still a directory and health surface. It does not yet make MCP calls
  gateway-backed with trust, audit, obligation, and OpenTelemetry metadata.
- The workbench has no argument playground or policy/audit call result view yet.
- The next UI IA slice should turn the central run area into a task-first
  workstream instead of expanding the right rail further.
