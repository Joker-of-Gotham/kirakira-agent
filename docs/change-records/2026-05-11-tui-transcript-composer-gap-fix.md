# 2026-05-11 transcript/composer gap fix

## Request

When scrolling the transcript, the bottom of the output would sometimes sit directly against the input area, while in other states an empty row would appear. The gap was inconsistent and needed to become stable.

## Root cause

The layout budget in `App.tsx` already reserved extra rows near the bottom of the transcript, but that reserve was only implicit. It reduced the visible transcript row count without rendering an actual spacer between the timeline and the composer.

As a result:

- some viewport and scroll states visually looked like they had a gap
- other states used the full rendered transcript height and ended flush against the input area

The UX problem was not in scrolling itself; it was that the bottom separation was budgeted but not explicitly drawn.

## Files changed

- `packages/cli/src/tui/App.tsx`
- `packages/cli/src/tui/InputArea.tsx`
- `test/tui/layout-stability.test.ts`

## Implementation

### Explicit composer gap

Added a `topGapRows` prop to `InputArea` and used it in the pinned transcript-mode composer. This makes the spacing between transcript output and the entire input region a rendered layout rule instead of a side effect.

### Budget split

Split the previous bottom safety reserve into:

- `composerGapRows = 1`
- `timelineSafetyRows = 1`

This keeps the overall layout budget stable while ensuring one row is always used as a visible spacer.

### Regression coverage

Updated the repeated-resize TUI layout test to:

- render the same explicit top gap used by the real app
- keep the frame within bounds after accounting for that gap
- assert that a blank line exists immediately before the composer context row

## Verification

```powershell
pnpm.cmd vitest run test\tui\layout-stability.test.ts
pnpm.cmd --filter @kirakira/cli typecheck
```

Observed result:

- the resize/layout test now verifies a stable blank line before the composer
- typecheck still passes

## Remaining note

This fix targets the transcript-to-composer boundary. If future work changes the composer height or adds another pinned footer row, `App.tsx` budget constants and the resize regression test should be updated together.
