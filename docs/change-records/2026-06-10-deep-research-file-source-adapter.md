# Deep research file source adapter

Date: 2026-06-10

## Scope

- Added a workspace-bounded `file` research source adapter in
  `@kirakira/deep-research`.
- The adapter walks configurable workspace roots, skips symlinks and configured
  generated/dependency directories, rejects roots outside the workspace, and
  emits `workspace://` citations with line pointers.
- Runtime-daemon deep research composition can now inject a default file source
  when deep research is configured and no explicit daemon memory or source
  adapter set owns the source list.
- `ResearchTaskExecutor` now reports the actual plan/node required source kinds
  instead of the broader policy-available source kinds.

## External references

- Node.js file-system promises API:
  <https://nodejs.org/api/fs.html>
- Node.js path API:
  <https://nodejs.org/api/path.html>
- MCP Tools specification 2025-11-25:
  <https://modelcontextprotocol.io/specification/2025-11-25/server/tools>

## Validation

```powershell
pnpm.cmd exec vitest run test/unit/deep-research/file.test.ts test/unit/deep-research/planner.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts
pnpm.cmd --filter @kirakira/deep-research typecheck
pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck
pnpm.cmd --filter @kirakira/runtime-daemon typecheck
```

Remaining roadmap work:

- Concrete live adapter suites for web and MCP source kinds.
- End-to-end live research gates that run file, web, and MCP adapters through
  daemon and workbench surfaces.
