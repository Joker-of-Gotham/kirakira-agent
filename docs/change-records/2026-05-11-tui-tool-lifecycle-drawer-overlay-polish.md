# 2026-05-11 TUI Tool Lifecycle and Drawer Overlay Polish

## Scope

This change continues the terminal UI cleanup after the tool-card and drawer review. It focuses on making tool execution read as one continuous lifecycle, improving drawer detail navigation, and keeping the drawer as a floating overlay instead of a layout-shifting panel.

## Changes

- Unified tool lifecycle rendering.
  - Tool execution now creates one timeline entry while running.
  - When the tool finishes, that same entry is updated to `done` or `failed` instead of appending a second visual block.
  - Restored sessions still pass through a merge layer that collapses adjacent old-style `call` + `done/fail` pairs when they refer to the same tool.

- Replaced raw JSON tool output with presentation-oriented previews.
  - Tool cards extract argument fields such as `command`, `path`, `target`, `query`, and `pattern` for running previews.
  - Finished tool cards extract useful result text from MCP-style `content` arrays, nested `structuredContent`, shell output fields, and error fields.
  - The card renderer avoids dumping wrapper JSON and instead shows concise shell/read/search/edit-style preview rows.

- Added running-state motion without splitting entries.
  - Running tool cards animate only the state label and color tone.
  - Finished cards keep a stable `done` or `failed` state, latency, target, and preview.

- Simplified Git branch metadata.
  - The status bar now uses the branch icon glyph before the branch name instead of spelling out `branch`.

- Improved drawer detail flow.
  - Enter opens a detail pane for the selected row across drawer tabs.
  - Session rows require a second Enter from the detail preview before resuming that session.
  - Esc backs out of details first, then closes the drawer.

- Kept the drawer as a floating overlay.
  - Removed the full-screen drawer background layer so the underlying transcript remains visually present around the centered panel.
  - The drawer itself keeps a raised Morandi surface, wider rows, a taller search band, and consistent footer hints.

## Validation

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `pnpm.cmd vitest run test\tui\layout-stability.test.ts test\tui\mouse.test.ts`
- `pnpm.cmd vitest run test\tui\layout-stability.test.ts test\tui\mouse.test.ts test\unit\cli\tui\timeline-lines.test.ts`

## Notes

- Terminals cannot render real alpha transparency in character cells. The drawer therefore behaves as a floating overlay by not painting a full-screen backdrop; the panel area itself remains opaque so text stays readable.
- Old session files may still contain historical split tool events. The renderer now collapses adjacent same-tool lifecycle pairs where possible.
