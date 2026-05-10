# 2026-05-11 Input Cursor Editing

## Background

The TUI input area previously behaved like an append-only buffer. Users could not move the cursor left or right to correct earlier text, and Backspace always removed the final character instead of the character before the cursor.

## Changes

- Added `cursorIndex` to the centralized input state in `App.tsx`.
- Extended the pure keyboard state machine in `key-handler.ts`:
  - Left arrow moves the cursor one character left.
  - Right arrow moves the cursor one character right.
  - Home and `Ctrl+A` move to the start.
  - End and `Ctrl+E` move to the end.
  - Printable input inserts at the cursor.
  - Backspace removes the character before the cursor.
  - Delete removes the character at the cursor.
  - History recall places the cursor at the end of the recalled prompt.
  - Escape and submit reset both input text and cursor state.
- Updated mention completion so inserting an `@file` completion at the cursor preserves the suffix after the cursor.
- Updated `InputArea.tsx` to render a visible cursor:
  - At the end of input, it renders an underscore cursor.
  - In the middle of input, it highlights the current character with the theme brand color.

## Tests

- Rewrote `test/unit/cli/tui/key-handler.test.ts` around the current interaction model.
- Added coverage for:
  - Cursor movement.
  - Insert-at-cursor.
  - Backspace-at-cursor.
  - Delete-at-cursor.
  - History recall cursor placement.

## Verification

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd vitest run test/unit/cli/tui/key-handler.test.ts test/tui/mouse.test.ts`
- `pnpm.cmd --filter @kirakira/cli build`

All commands passed after this change.
