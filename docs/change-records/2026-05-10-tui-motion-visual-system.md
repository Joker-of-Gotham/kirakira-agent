# TUI motion and visual system upgrade

Date: 2026-05-10

## Background

The formal interactive page had three visible problems:

- Status updates, model thinking, streaming answer text, and tool calls were mixed into the same scrollback timeline.
- Progress states were static text, so long-running work looked frozen even when the process was still alive.
- The right drawer depended on icon glyphs and border-heavy layout, which made Windows terminals show garbled or cramped status text.

The implementation keeps the existing Ink/React terminal stack. No new launch path, framework, or setup step was added.

## Changed Files

- `packages/cli/src/tui/motion.tsx`
- `packages/cli/src/tui/hooks/useTicker.ts`
- `packages/cli/src/tui/Timeline.tsx`
- `packages/cli/src/tui/StatusBar.tsx`
- `packages/cli/src/tui/InputArea.tsx`
- `packages/cli/src/tui/ContextDrawer.tsx`
- `packages/cli/src/tui/hooks/useChat.ts`
- `packages/cli/src/tui/timeline-lines.ts`
- `packages/cli/src/tui/theme.ts`
- `packages/cli/src/tui/config.ts`
- `packages/cli/src/tui/types.ts`
- `packages/cli/src/tui/App.tsx`

## Implementation Details

### Motion layer

Added a shared ticker hook and a small TUI motion component layer:

- `useTicker(enabled, intervalMs)` provides frame-based re-render ticks with cleanup.
- `Spinner` gives active loading feedback without blocking on tool/API work.
- `AnimatedDots` gives subtle activity feedback for model thinking and streaming.
- `ProgressBar` supports smooth Unicode block progress with an ASCII fallback via `KIRAKIRA_TUI_ASCII=1` or `KIRAKIRA_TUI_UNICODE=0`.
- `StatusPill` provides compact state markers without relying on Nerd Font icons.

### Thinking and streaming flow

The timeline no longer receives transient thinking state as normal scrollback lines from `App.tsx`.

Instead, `Timeline.tsx` renders a fixed activity band at the bottom of the main pane. This separates durable chat history from live model activity:

- thinking state shows as a dynamic "thinking" band;
- streamed answer chunks show as a "streaming" band;
- tool execution shows as a "tool call" band with elapsed time;
- completed or failed tool state is colored distinctly before the final answer clears the activity band.

### Tool call state

`useChat.ts` now exposes `activeTool`.

Each parsed tool call is represented with:

- tool name;
- shortened JSON argument preview;
- started timestamp;
- status: `running`, `completed`, or `failed`;
- latency/error when available.

Timeline tool records were changed from glyph-prefixed strings to stable ASCII records:

- `call <tool> <args-preview>`
- `done <tool> <latency>ms`
- `fail <tool>: <error>`

This avoids Windows glyph corruption and gives the renderer enough structure to color failed tool results.

### Status bar and input area

`StatusBar.tsx` now shows:

- active spinner when the model, tasks, or MCP startup are busy;
- smooth task progress when runtime task progress is available;
- MCP readiness and healthy server count;
- active tool name while a tool is running.

`InputArea.tsx` now shows the same active state instead of a static "waiting for model response" string.

### Right drawer

`ContextDrawer.tsx` was rebuilt around background sections and status pills instead of border-heavy rows and glyph icons.

The MCP tab now has:

- clear starting state;
- progress for healthy servers during startup;
- separate `OK`/`ERR` pills with server name and tool count;
- explicit error text when a server reports one.

Tasks, subagents, sessions, memory, policy, trace, and config tabs were also normalized to the same visual language.

### Theme

Added built-in palettes:

- `catppuccin`
- `tokyo-night`
- `nord`

The default TUI theme is now `catppuccin`. `system` dark mode and `opencode-dark` also resolve to the new Catppuccin palette, while `paper` remains the light fallback.

## Compatibility Notes

- No extra install step is required.
- No new runtime path was added.
- Unicode animation is enabled by default, but terminals with poor glyph support can run with `KIRAKIRA_TUI_ASCII=1`.
- The implementation remains inside the existing Ink/React TUI architecture.

## Verification

Ran:

```powershell
pnpm.cmd --filter @kirakira/cli typecheck
pnpm.cmd --filter @kirakira/cli build
pnpm.cmd start -- mcp list
```

Result:

- TypeScript check passed.
- CLI package build passed.
- Single-entry Docker-backed startup path completed and listed the seven configured MCP servers.
