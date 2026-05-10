# 2026-05-11 TUI Markdown And Row-Scroll Fix

## Scope

This change fixes two user-visible transcript failures in the TUI:

- final assistant markdown rendering was still structurally broken
- transcript scrolling was still item-based instead of visual-row-based

The target was the main chat timeline only. This round does not change provider routing, MCP execution logic, or Docker startup policy.

## Root Cause

The remaining corruption came from two architectural problems:

1. `scrollOffset` still tracked timeline items, while the renderer was showing multi-row cards. Large assistant cards therefore could not be traversed row by row, and the visible window could skip content.
2. `md-render.tsx` still treated most markdown as plain text plus a narrow special case for tables. Code fences, horizontal rules, and block structure were not modeled, so final output could show literal fences, partial blocks, and broken wrapping.

There was also a smaller interaction issue:

3. Inline "earlier/newer lines" markers consumed transcript rows, which made exact one-row scrolling impossible at the transition away from the bottom.

## Changes

### 1. Rebuilt markdown rendering around row models

File:

- `packages/cli/src/tui/md-render.tsx`

Changes:

- replaced the old text/table-only block model with structured blocks for:
  - paragraphs
  - atx and setext headings
  - fenced code blocks
  - horizontal rules
  - tables
- added `renderMarkdownRows()` as the canonical visual-row renderer
- made `estimateMarkdownRows()` derive from the same row model instead of a separate estimate path
- updated `MarkdownText` to support `startRow` and `rowCount` slicing
- changed table rendering to ASCII borders so width handling is deterministic in Windows terminals
- ensured `renderMarkdownToAnsi()` strips code fences instead of leaking literal markdown delimiters

Reason:

The renderer now works from a concrete row model. That removes the previous mismatch between "what the estimator thinks exists" and "what the user actually sees".

### 2. Switched transcript selection from item-based to row-based

File:

- `packages/cli/src/tui/Timeline.tsx`

Changes:

- added `measureTimelineRows()`
- changed `selectVisibleTimelineLines()` to select slices of visible rows instead of whole timeline items
- introduced `VisibleTimelineSlice` with:
  - source line
  - starting row within the line
  - visible row count
  - total row count for that line
- removed the old allocation/clipping model that only trimmed whole cards against a viewport budget
- changed `TimelineLine` rendering to render only the requested row slice for:
  - assistant markdown cards
  - user cards
  - tool cards
  - error cards
  - meta lines

Reason:

The transcript can now move through oversized cards row by row instead of jumping across whole cards or clipping arbitrary content.

### 3. Removed inline scroll markers from the timeline body

Files:

- `packages/cli/src/tui/Timeline.tsx`
- `packages/cli/src/tui/StatusBar.tsx`

Changes:

- removed the in-timeline "earlier lines" and "newer lines" rows
- kept scroll state in the status bar instead
- added `scrollLimit` to `StatusBar`

Reason:

Those inline markers consumed transcript rows and prevented exact one-row scrolling near the bottom and top boundaries.

### 4. Made mouse wheel scrolling explicitly one visual row per event

File:

- `packages/cli/src/tui/App.tsx`

Changes:

- changed mouse wheel scrolling from config-scaled steps to `1` row per event
- switched app-side max-scroll calculations to use total transcript rows instead of item count
- passed transcript-row totals into the keyboard state machine
- clamped `scrollOffset` whenever the visible row budget changes

Reason:

The user requirement was row-by-row transcript scrolling. This makes the input surface and wheel behavior agree with the new row-based selector.

### 5. Added regression coverage for markdown structure and row scrolling

Files:

- `test/unit/cli/tui/md-render.test.ts`
- `test/tui/layout-stability.test.ts`

Changes:

- added markdown renderer tests for fenced code blocks, rules, tables, and ansi transcript output
- added a selector regression that verifies a single large assistant card scrolls upward one visual row at a time
- updated layout tests to use `measureTimelineRows()` and the new row-based selector

Reason:

This closes the test gap that previously allowed the markdown renderer and the scroll selector to diverge.

## Validation

Commands run:

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `pnpm.cmd vitest run test\tui\layout-stability.test.ts test\tui\mouse.test.ts test\unit\cli\tui`
- `pnpm.cmd start -- --help`

Result:

- all commands passed
- the CLI smoke test still rebuilds the Docker runtime image before showing help; that startup-path behavior remains separate from this TUI fix

## Files Changed

- `packages/cli/src/tui/App.tsx`
- `packages/cli/src/tui/StatusBar.tsx`
- `packages/cli/src/tui/Timeline.tsx`
- `packages/cli/src/tui/md-render.tsx`
- `test/tui/layout-stability.test.ts`
- `test/unit/cli/tui/md-render.test.ts`

## Remaining Risk

The new renderer is intentionally pragmatic rather than full CommonMark. It covers the structures currently breaking the UI:

- headings
- lists
- quotes
- code fences
- rules
- tables
- inline bold, italic, and code

If a later issue shows up in nested markdown edge cases, the next step should be extending the row model instead of reintroducing string-only rendering.
