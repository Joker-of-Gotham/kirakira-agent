# 2026-05-11 Runtime, Mouse, and Morandi TUI Upgrade

## Background

This change addresses a set of usability issues observed after launching the formal interactive TUI with `pnpm.cmd start`:

- Docker appeared to perform repeated visible startup/build work on every launch.
- Timeline, input, and tool sections did not form clear light-gray background blocks.
- Terminal mouse escape sequences could be appended into the input field.
- Thinking/tool/shell activity was visually mixed with regular transcript text.
- The home screen logo was too thin and hard to read.
- The default visual language needed a softer Morandi-style palette.

## Runtime Startup Changes

- Updated `scripts/kirakira.mjs` so normal startup uses a single managed path:
  - Ensure `.env` and `.mcp.json`.
  - Ensure the runtime image only when the runtime source hash changed.
  - Start Docker services with `docker compose up -d --wait` quietly.
  - Enter the CLI container with `docker compose run --rm --no-deps --no-build`.
- Added a local runtime hash cache at `.kirakira/runtime-image.hash`.
- Added the runtime hash cache to `.gitignore`.
- Excluded policy files and the host launcher script from the image hash because they are mounted or host-only during normal runtime.

## Mouse Input Changes

- Added `packages/cli/src/tui/mouse.ts`.
- Centralized parsing for SGR mouse events and legacy X10 mouse events.
- Added printable-input filtering so click, release, drag, and wheel sequences are consumed before they reach the prompt buffer.
- Updated:
  - `App.tsx` for wheel scrolling and click-based focus switching.
  - `ProviderSetup.tsx` to prevent setup key/model fields from receiving mouse sequences.
  - `key-handler.ts` to reject terminal control sequences at the pure state-machine layer.
- Added `test/tui/mouse.test.ts` for wheel parsing and non-printable mouse input guards.

## Visual Design Changes

- Reworked the default `kirakira` theme in `theme.ts` around a Morandi dark palette:
  - Near-black base.
  - Noticeably lighter gray raised/overlay panels.
  - Dusty rose brand color.
  - Sage, sand, mist blue, and mauve semantic accents.
- Updated the home screen logo in `HomeScreen.tsx` to a solid block-letter `KIRAKIRA` wordmark with a compact fallback for narrow terminals.
- Rebuilt `Timeline.tsx` around full-width background cards:
  - User prompts use raised cards.
  - Thinking uses a muted accent card.
  - Tool calls use tool-specific cards.
  - Errors use dedicated danger cards.
  - Left accent bars now sit before the content padding instead of aligning with text.
- Updated `InputArea.tsx`:
  - Full-width raised input block.
  - More visible left accent bar.
  - Spinner state for active thinking/tool execution.
  - Cleaner prompt metadata line.
- Updated `StatusBar.tsx`:
  - Uses the sunken surface background.
  - Uses a Braille spinner for busy state.
  - Accounts for wider padding in line fitting.
- Updated `ContextDrawer.tsx` rows to use full-width sunken row backgrounds with stronger padding.

## Tool and Shell Presentation

- Shell commands submitted with `!` are now recorded as structured `tool_call` / `tool_result` timeline entries instead of plain system text.
- `Timeline.tsx` now classifies tool calls by name and args:
  - Shell/exec commands show `$ command` preview.
  - Patch/edit/write calls show file or diff-like previews where available.
  - Read/search/git/memory calls receive distinct labels and accent colors.
- Increased tool argument preview capture in `useChat.ts` so JSON arguments are usually parseable by the renderer.

## Verification

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd vitest run test/tui/mouse.test.ts`
- `node --check scripts\kirakira.mjs`
- `pnpm.cmd --filter @kirakira/cli build`

All commands passed after this change.
