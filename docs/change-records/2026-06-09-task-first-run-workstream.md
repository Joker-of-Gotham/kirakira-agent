# Task-first Run Workstream

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Context

The shared web and desktop workbench already consumed the browser-safe runtime
transport and projected run events into dashboard, inspector, topology, MCP, and
artifact views. The first Run Workstream slice needed to make the active plan
the primary surface without adding renderer-local ports, file paths, or a new
runtime protocol.

## Changes

- Added a frontend-core `createRunWorkstream()` projection that derives a
  task-first board, inline activity stream, attention items, and detail drawer
  state from existing `RunEvent` streams plus the current dashboard projection.
- Replaced the primary workbench timeline pane with a Run Workstream UI:
  attention strip, plan board, live activity stream, and detail drawer.
- Kept Web and Electron on the existing shared `RuntimeTransport` surface; no
  endpoint, token, or local workspace path literals were added.
- Added focused unit coverage for board column placement, approval/failure
  attention promotion, detail drawer selection, and activity stream ordering.

## Validation

- `pnpm.cmd exec vitest run test/unit/frontend-core/workstream.test.ts test/unit/frontend-core/projection.test.ts`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app build`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/desktop build`
- Browser smoke against an `@kirakira/web` mock transport dev server: 4 board
  columns, 9 work cards, 14 activity entries, 1 attention item, detail drawer
  rendered, and no horizontal overflow in the workstream layout.

## Visual Risk

- The normal desktop layout uses a 2x2 plan board so it can coexist with the
  existing topology and right-rail panels. Ultra-wide viewports switch to four
  columns; this is intentionally conservative until the broader Web/Electron
  information architecture is settled.
