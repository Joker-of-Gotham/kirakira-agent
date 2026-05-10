# 2026-05-11 TUI Modal, Markdown, and Interaction Upgrade

## Background

The previous TUI still had several structural problems:

- The home state and transcript state shared the same bottom-composer layout, leaving the first screen visually weak.
- MCP/status/config panels were still implemented as a right-side drawer, which made the layout crowded and inconsistent with OpenCode-style centered dialogs.
- User prompts, thinking, and tool calls did not have enough block contrast.
- Tool calls were rendered as plain gray strings, so path, status, latency, and tool type were hard to scan.
- Keyboard and mouse scrolling behavior was still mixed with prompt history recall.

## References Used

- Ink: component/Flexbox terminal rendering model.
- OpenCode TUI dialogs: command stack, modal dialog sizing, and status dialog pattern.
- OpenCode session rendering: message-part layering for text, tool, reasoning, and file/context parts.
- marked-terminal: terminal Markdown renderer with configurable strong/em/code/blockquote/table styling.
- AstroNvim/Neovim design direction: high-contrast but restrained code/Markdown readability.
- CLI guidelines: default output should avoid unnecessary noise and expose detail through explicit routes.
- Terminal mouse notes: alternate-screen mouse scrolling needs SGR mouse support to avoid conflating wheel events with arrow-key history.

## Changes

### Home Screen

- Added `HomeScreen.tsx` for the empty-session landing state.
- Hid the status bar on the idle home screen.
- Moved the real input composer into the centered home layout instead of leaving it pinned at the bottom.
- Added a large centered Kirakira ASCII logo and compact command hints.

### Inspector / MCP Modal

- Removed the right-side drawer rendering path from `App.tsx`.
- Converted `ContextDrawer` into a centered modal-style inspector.
- `Ctrl+O` now opens/closes the centered inspector, and `Ctrl+T` opens the MCP tab directly.
- The inspector blocks normal typing while open and closes with `Esc`.
- MCP/status/task/session/config views now share the same modal surface rather than competing with the transcript as a sidebar.

### Scroll and Input Semantics

- Rewrote `key-handler.ts` to enforce a single simple rule:
  - `Up/Down`: prompt history recall.
  - `PgUp/PgDn` and `Ctrl+U/D`: transcript scroll.
  - Mouse wheel: transcript scroll when SGR mouse events are available.
- Added SGR mouse enable/disable setup in `App.tsx`.
- Added parsing for SGR wheel button codes `64` and `65`.
- Removed the old implicit scroll mode entered by `Esc`.

### Prompt, Thinking, and Tool Blocks

- User messages now render on a slightly lighter gray block with a thicker left accent.
- The composer uses the same block language and thicker left accent.
- Active thinking/tool activity now renders with a light gray panel and a colored left bar.
- Historical reasoning chunks are stored as `thinking` timeline entries when providers stream thinking text.

### Tool Rendering

- Added `thinking` to `TimelineEventKind`.
- Tool calls and results now render as structured rows instead of plain text.
- Tool names are color-coded by rough category:
  - read/list/tree: info blue
  - search/grep: memory cyan
  - write/patch/edit: pink
  - git: purple
  - shell/exec: amber
- Tool fields such as `path`, latency, status, and preview text use distinct colors.
- Tool result rows include a bounded result preview for better traceability without flooding the transcript.

### Markdown Rendering

- Expanded `marked-terminal` styling:
  - bold/strong text now uses the primary foreground.
  - italic/emphasis uses a warm muted tone.
  - inline code and links use blue.
  - blockquotes receive a left accent.
  - tables and horizontal rules use low-contrast gray.
- Kept compact table normalization to avoid heavy box-border tables in narrow terminals.

## Files Changed

- `packages/cli/src/tui/App.tsx`
- `packages/cli/src/tui/HomeScreen.tsx`
- `packages/cli/src/tui/ContextDrawer.tsx`
- `packages/cli/src/tui/HotkeyBar.tsx`
- `packages/cli/src/tui/InputArea.tsx`
- `packages/cli/src/tui/StatusBar.tsx`
- `packages/cli/src/tui/Timeline.tsx`
- `packages/cli/src/tui/hooks/useChat.ts`
- `packages/cli/src/tui/key-handler.ts`
- `packages/cli/src/tui/md-render.tsx`
- `packages/cli/src/tui/theme.ts`
- `packages/cli/src/tui/timeline-lines.ts`
- `packages/cli/src/tui/types.ts`

## Verification

Passed:

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `git diff --check`

Notes:

- `git diff --check` only reported Windows LF-to-CRLF normalization warnings for existing working-copy files; it did not report whitespace errors.
