# 2026-05-11 multiline composer growth fix

## Request

The composer stayed visually fixed at one prompt row. Once the input text wrapped past one line, the later content was no longer visible, the message box did not grow, and the page budget did not adapt with it.

## Root cause

Two independent shortcuts were still in place:

- `InputArea.tsx` rendered the prompt body as a fixed `height={1}` row
- `App.tsx` budgeted the pinned composer as a constant two-row surface plus an optional one-row context line

That meant the UI had no shared concept of "actual composer height". Even if the prompt text logically needed more rows, rendering clipped it and layout still reserved the old fixed height.

## Files changed

- `packages/cli/src/tui/InputArea.tsx`
- `packages/cli/src/tui/App.tsx`
- `test/tui/layout-stability.test.ts`

## Implementation

### Shared composer measurement

Added shared input layout helpers in `InputArea.tsx`:

- `defaultInputAreaMaxPromptRows`
- `buildInputAreaLayout`
- `measureInputAreaRows`

These helpers wrap prompt text with the same width assumptions used by the real composer and return the actual rendered row count.

### Wrapped prompt rendering

Replaced the old single-line prompt body with row-based rendering:

- input text now soft-wraps inside the composer
- the composer grows as the wrapped row count increases
- the cursor row stays visible when the prompt exceeds the configured max prompt rows
- thinking state uses the same wrapped-row path, so runtime labels also stay stable in narrow windows

### Layout budget wiring

`App.tsx` now measures the composer height before computing transcript visibility. The transcript viewport and the pinned composer therefore shrink and grow together instead of diverging.

### Regression coverage

Updated the TUI layout tests to:

- compute transcript height using the same composer measurement helper
- verify the composer still survives repeated resize cycles
- verify long prompts grow beyond one line and keep the tail content visible in narrow windows

## Verification

```powershell
pnpm.cmd vitest run test\tui\layout-stability.test.ts test\tui\mouse.test.ts test\unit\cli\tui
pnpm.cmd --filter @kirakira/cli typecheck
pnpm.cmd --filter @kirakira/cli build
```

## Notes

The composer now behaves like a bounded growing surface rather than a permanently single-line field. If future work changes paddings, prompt prefix width, or footer structure, `InputArea.tsx` and `App.tsx` must be updated together so measurement and rendering stay identical.
