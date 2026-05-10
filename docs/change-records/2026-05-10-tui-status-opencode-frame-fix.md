# TUI status bar frame rendering fix

Date: 2026-05-10

## Background

The formal interactive page could print many repeated status rows while MCP startup, task progress, or spinner frames were active. The visible failure mode was:

- the top status line exceeded the terminal width;
- the line wrapped into fragments such as split project/model text;
- each spinner frame rendered in the main terminal buffer and accumulated in scrollback;
- Windows terminals amplified the problem when Unicode spinner/block glyph widths were inconsistent.

This change follows the practical constraints visible in opencode's TUI implementation: keep animated surfaces in a frame-rendered terminal area, keep footer/status rows fixed-height, and make long text truncate instead of wrapping.

## Reference Notes

Checked current opencode source from `anomalyco/opencode` branch `dev`:

- `packages/opencode/src/cli/cmd/tui/app.tsx` uses a dedicated frame renderer with a target FPS instead of linear printing.
- `packages/opencode/src/cli/cmd/run/footer.view.tsx` keeps footer rows as a fixed stack and uses no-wrap/truncation behavior for long model and status text.
- `packages/opencode/src/cli/cmd/tui/context/theme/opencode.json` uses a very dark base surface, low-contrast raised panels, and a small warm accent set.

## Changed Files

- `packages/cli/src/commands/chat.ts`
- `packages/cli/src/tui/StatusBar.tsx`
- `packages/cli/src/tui/HotkeyBar.tsx`
- `packages/cli/src/tui/InputArea.tsx`
- `packages/cli/src/tui/motion.tsx`
- `packages/cli/src/tui/theme.ts`
- `packages/cli/src/tui/config.ts`

## Implementation Details

### Full-screen frame surface

`chat.ts` now starts the interactive TUI with `alternateScreen: true`.

This keeps spinner/status refreshes inside one terminal surface instead of appending every frame to the normal scrollback buffer. The launch command remains the same; no new runtime path or manual setup step was introduced.

### Status bar

`StatusBar.tsx` was changed from a flex row of many independent text fragments to a pre-computed single-line string:

- fixed height: one row;
- fixed width: current terminal columns;
- explicit left/middle/right budgets;
- all long fields pass through truncation;
- no child segment is allowed to wrap;
- task, MCP startup, active tool, approval, memory, and scroll states are condensed into the middle budget.

This directly addresses the repeated-line and broken-layout failure shown in the terminal capture.

### Input and hotkey rows

`InputArea.tsx` and `HotkeyBar.tsx` now use fixed one-line containers with truncating text. This prevents long prompts, model names, shortcuts, or tool labels from resizing the terminal layout while the app is busy.

### Windows-safe animation

`motion.tsx` now defaults to ASCII spinner/progress glyphs on Windows. Unicode animations can still be forced with:

```powershell
$env:KIRAKIRA_TUI_UNICODE = '1'
```

ASCII mode can be forced anywhere with:

```powershell
$env:KIRAKIRA_TUI_ASCII = '1'
```

This avoids ambiguous-width Braille/block characters on Windows terminals while preserving richer animation on terminals that handle Unicode cleanly.

### Theme

The built-in `opencode` theme was added and made the default theme. Its palette is mapped from opencode's dark theme values:

- near-black base and raised surfaces;
- muted gray text hierarchy;
- warm primary accent;
- separate tool/reasoning/success/warning/error colors.

`opencode-dark`, system dark fallback, and unknown-theme fallback now resolve to this opencode-style palette. Earlier `catppuccin`, `tokyo-night`, and `nord` presets remain available as explicit choices.

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
- The single Docker-backed startup entry listed all seven configured MCP servers.

## Current Startup

Use the same single entrypoint:

```powershell
pnpm.cmd start
```

The command should now enter the formal interactive page without the spinner/status row filling scrollback.
