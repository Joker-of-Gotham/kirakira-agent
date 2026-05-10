# Kirakira TUI aesthetic upgrade

Date: 2026-05-10

## Background

The formal interactive page still looked weaker than opencode in screenshots:

- the top status line exposed too much operational text;
- Markdown tables rendered as heavy bordered grids;
- the bottom composer was a cramped one-line command prompt instead of a focused input surface;
- side panels used too many filled blocks and repeated labels;
- the visual identity was generic dark CLI instead of a coherent kirakira theme.

The goal of this pass was to keep the single existing startup path and Ink/React architecture, but make the TUI quieter, more coordinated, and closer to opencode's composition style.

## References

Checked:

- opencode theme docs: default theme, truecolor requirements, and theme customization model.
- opencode TUI source: frame-based TUI, footer layout, and `opencode.json` palette.
- Codex TUI architecture notes: semantic color usage, frame rendering, compactness, and wrapping guidance.
- `marked-terminal` local docs: table rendering behavior and renderer override options.

## Changed Files

- `packages/cli/src/tui/theme.ts`
- `packages/cli/src/tui/config.ts`
- `packages/cli/src/tui/md-render.tsx`
- `packages/cli/src/tui/timeline-lines.ts`
- `packages/cli/src/tui/Timeline.tsx`
- `packages/cli/src/tui/InputArea.tsx`
- `packages/cli/src/tui/HotkeyBar.tsx`
- `packages/cli/src/tui/StatusBar.tsx`
- `packages/cli/src/tui/SidebarPanel.tsx`
- `packages/cli/src/tui/ContextDrawer.tsx`
- `packages/cli/src/tui/App.tsx`

## Implementation Details

### Theme

Added a new default `kirakira` theme:

- near-black base surface;
- soft raised panels;
- sakura pink brand color;
- Arch-like cyan secondary accent;
- lavender reasoning color;
- mint success/diff color;
- warm amber warning color.

The default config now uses:

- `theme: "kirakira"`;
- `density: "compact"`;
- compact timeline cards.

`opencode`, Catppuccin, Tokyo Night, and Nord remain available as explicit themes.

### Markdown Rendering

Markdown tables are now transformed before `marked-terminal` renders them.

Instead of bordered table grids, tables are converted into aligned plain rows. This keeps output readable without turning the terminal into a spreadsheet. The transformer includes a small visual-width estimator for CJK text, strips simple Markdown emphasis inside table cells, caps wide cells, and preserves columns with spacing.

The renderer styling was also softened:

- headings use kirakira pink;
- inline code and links use cyan;
- blockquotes are muted;
- emoji rendering is disabled for cleaner terminal output.

### Timeline

Timeline entries now carry a small lane hint:

- user turns render with a single left accent line and raised background;
- assistant text renders as plain content without extra prefixes;
- system/tool/skill/approval events render as dim compact meta lines;
- tool results use `ok`/`x` instead of verbose labels.

This removes unnecessary labels while preserving action transparency.

### Composer

The input area was rebuilt into a two-line composer panel inspired by opencode:

- left accent line;
- focused raised background;
- first row for prompt or active tool state;
- second row for mode, model, running task count, and a tiny status hint.

The separate hotkey bar is now a low-noise right-aligned hint row.

### Chrome And Panels

The status bar was reduced to one subtle row:

- kirakira/workspace on the left;
- active MCP/task/tool state in the middle only when useful;
- mode/model/session on the right.

The sidebar and context drawer now use the same single-side accent language and quieter backgrounds.

## Verification

Ran:

```powershell
pnpm.cmd --filter @kirakira/cli typecheck
pnpm.cmd --filter @kirakira/cli build
pnpm.cmd start -- mcp list
git diff --check
```

Also smoke-tested Markdown table rendering from the built CLI output. The result is borderless aligned rows.

Result:

- TypeScript check passed.
- CLI build passed.
- Single-entry Docker-backed startup listed all seven configured MCP servers.
- Whitespace check passed; only existing Windows LF/CRLF warnings were printed.
