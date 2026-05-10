# 2026-05-11 TUI Layout Stability Fix

## Scope

This change focuses on layout stability in the main chat timeline. The failure mode reported by the user was:

- timeline cards overlapping each other
- wrapped text colliding across rows
- tool cards underestimating height and pushing later content upward
- the bottom composer disappearing after long outputs

This round does not change provider logic or MCP execution logic. It only hardens TUI rendering and row budgeting.

## Root Cause

The instability came from three separate issues stacking together:

1. The timeline now renders card-style entries, but row budgeting still had underestimation in a few places, especially tool preview cards and markdown tables.
2. Several multi-line blocks were still allowed to shrink inside flex layouts, which made Ink compress cards when the viewport became tight.
3. The app reserved too little guaranteed space for the bottom composer and hotkey bar, so a small row-estimation miss could hide the input area.

## Changes

### 1. Markdown row estimation

File:

- `packages/cli/src/tui/md-render.tsx`

Changes:

- removed the unused `wrapPlainLine()` helper that was left behind after the markdown renderer rewrite
- increased markdown table row estimation from `rows + 3` to `rows + 5`

Reason:

Rendered tables include both border lines and vertical margins. The earlier estimate was too low, which let the timeline select too many items for the available viewport.

### 2. Tool card height estimation

File:

- `packages/cli/src/tui/Timeline.tsx`

Changes:

- accounted for the extra preview top margin when a tool card has preview output but no explicit target row

Reason:

Tool cards were sometimes one row taller than the estimator believed, especially for read/search/tool-result cards. That mismatch was enough to destabilize the visible window.

### 3. Non-shrinking timeline cards

Files:

- `packages/cli/src/tui/Timeline.tsx`
- `packages/cli/src/tui/InputArea.tsx`
- `packages/cli/src/tui/StatusBar.tsx`
- `packages/cli/src/tui/HotkeyBar.tsx`

Changes:

- added `flexShrink={0}` to timeline cards, activity panel, input area shell, status bar, and hotkey bar
- made card bodies explicit `flexDirection="column"` containers with `overflow="hidden"` and full-width inner layout
- kept blank spacer rows explicit and non-shrinking

Reason:

When long outputs and multiple cards were present at once, Yoga/Ink could compress blocks more than intended. Multi-line cards must behave as fixed-height render blocks once their content has been wrapped.

### 4. Safer viewport budgeting

File:

- `packages/cli/src/tui/App.tsx`

Changes:

- replaced the old coarse `chromeRows` formula with explicit budgeting for:
  - composer rows
  - optional context row
  - hotkey bar
  - extra timeline safety rows

Reason:

The old formula was too optimistic. The new budgeting intentionally leaves a small safety buffer so the composer remains visible even when a long markdown or tool card slightly exceeds its estimate.

### 5. Scroll indicators aligned with the new selector

File:

- `packages/cli/src/tui/Timeline.tsx`

Changes:

- switched indicator rendering to use `hasAboveIndicator` and `hasBelowIndicator` from the row-aware selector

Reason:

This keeps the indicator state consistent with the actual visible-card selection logic and removes stale branching.

### 6. Oversized card clipping in tiny windows

File:

- `packages/cli/src/tui/Timeline.tsx`

Changes:

- added exported helpers:
  - `estimateTimelineLineRows()`
  - `selectVisibleTimelineLines()`
  - `allocateVisibleTimelineRows()`
- card rows are now allocated against the real remaining viewport budget
- when a single assistant/tool/thinking/error card is taller than the available viewport, the card body is clipped to the allocated rows instead of overflowing into the composer area
- card top gap is removed automatically when only a single terminal row is available

Reason:

The first version of row-aware selection still had one failure mode: if the newest single card itself was taller than the viewport, it stayed selected but was not clipped during render. That meant very narrow windows could still push the bottom input area off-screen. The new allocation layer closes that gap.

### 7. Mixed-case resize regression tests

Files:

- `test/tui/layout-stability.test.ts`
- `test/unit/cli/tui/timeline-lines.test.ts`

Changes:

- updated stale `timeline-lines` assertions from the old line-by-line transcript model to the current card-based timeline model
- added pure layout-budget stress coverage across:
  - narrow and wide terminal widths
  - small and medium viewport heights
  - collapsed and expanded tool previews
  - multiple scroll offsets
- added real Ink render smoke tests with mocked TTY output for:
  - transcript surface rendering
  - repeated resize transitions
  - tiny-window `ctrl+r`-style expanded tool details
  - home screen rendering

Reason:

This turns resize stability into an automated regression surface instead of a manual visual-only check.

## Validation

Commands run:

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `pnpm.cmd vitest run test\tui\layout-stability.test.ts test\tui\mouse.test.ts test\unit\cli\tui`

Result:

- all commands passed

## Follow-up

If layout corruption is still visible after this round, the next place to inspect is not the estimator first. It would be the actual render model for mixed-width text in Ink, especially Chinese plus inline styling in long assistant answers. That would require a narrower reproduction case and likely a render snapshot test around `MarkdownText` plus `Timeline`.
