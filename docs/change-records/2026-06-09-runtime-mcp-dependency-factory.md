# 2026-06-09 Runtime MCP Dependency Factory

## Context

The daemon had two independent MCP setup paths:

- `runtime-deps.ts` built subagent/delegate runtime dependencies from `.mcp.json`.
- `mcp-runtime.ts` built browser/desktop `mcp_call` dependencies from `.mcp.json` plus resolved runtime profiles.

That split meant subagent runtime could miss profile-defined MCP servers, and future policy/audit changes would have to be patched in multiple places.

## Changed

- Added `mcp-runtime-deps.ts` as the shared MCP dependency factory for daemon-owned runtimes.
- Centralized `.mcp.json` registration, active runtime profile selection, profile MCP server projection, `McpClientManager`, `McpPep`, PDP, audit writer, and cleanup ownership.
- Updated delegate runtime and direct daemon MCP runtime to use the shared factory.
- Passed `resolvedConfig` and `runtimeProfileName` from `KernelBridge` into delegate runtime construction, so subagents now see the same profile-selected MCP server set as browser/desktop MCP calls.
- Added tests for active-profile MCP server registration and KernelBridge factory propagation.

## Remaining Work

- Extend the shared factory to compose memory, audit ledger, deep research, and OTel trace dependencies.
- Expose live MCP health/discovery through runtime contracts and workbench views.
- Replace CLI MCP setup duplication with the same resolved-profile projection where CLI behavior permits.
