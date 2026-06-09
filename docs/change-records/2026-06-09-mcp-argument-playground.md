# 2026-06-09 MCP Argument Playground

## Problem

The shared web/Electron workbench could discover MCP servers and tool schemas,
but it stopped at a read-only directory view. Operators still had to leave the
workbench to shape arguments and invoke a discovered tool.

## Files Changed

- `packages/frontend-core/src/mcp-directory.ts`
- `packages/frontend-core/src/mcp-playground.ts`
- `packages/frontend-core/src/index.ts`
- `packages/frontend-app/src/workbench.tsx`
- `packages/frontend-app/src/styles.css`
- `test/unit/frontend-core/mcp-playground.test.ts`
- `docs/architecture.md`
- `docs/upgrade/eam-parity-roadmap.md`
- `docs/change-records/2026-06-09-mcp-argument-playground.md`

## Implementation Details

`mcp-directory` now preserves typed trust, policy, audit, and OTel metadata on
directory tools, inheriting server-level metadata when a tool does not override
it. The new `mcp-playground` view-model converts discovered schema metadata into
an editable JSON argument draft, parses edited drafts into call arguments, and
projects trust/policy/audit/call-result metadata into compact UI rows.

The shared workbench binds that view-model into the MCP panel:

- selected tool arguments are editable as JSON
- invalid argument JSON is blocked before a call
- execution uses the existing `runtime.callMcpTool()` transport method
- the selected server and tool come from `runtime.listMcpTools()` discovery data
- no UI path hardcodes server names, local paths, ports, or daemon endpoints

## Operator Impact

Web and Electron users can now inspect a discovered MCP tool, edit arguments,
review trust/policy/audit context, execute the call, and inspect the returned
policy/result summary without leaving the workbench.

## Verification

Run:

```powershell
pnpm --filter @kirakira/frontend-core typecheck
pnpm --filter @kirakira/frontend-app typecheck
pnpm test -- test/unit/frontend-core/mcp-directory.test.ts test/unit/frontend-core/mcp-playground.test.ts
```
