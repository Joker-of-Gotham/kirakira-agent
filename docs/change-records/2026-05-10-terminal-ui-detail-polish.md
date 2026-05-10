# 2026-05-10 Terminal UI Detail Polish

## Background

The terminal UI still felt too noisy after the previous pass: the status bar exposed too much always-on metadata, the composer and timeline relied on large background blocks, and Markdown colors were brighter than the rest of the Kirakira palette.

This pass was informed by:

- `terminal-ui-design-system`: warm terracotta emphasis, command-prefix micro accent, dark low-contrast surfaces, and 4px-style spacing discipline.
- `cli-guidelines-zh`: human-readable output should stay moderate and avoid unnecessary verbosity in the default interactive surface.
- `Dribbble terminal-ui` references: strong single-side accent, sparse center-weighted composition, and restrained neon usage.
- `tui-studio`: stable component layout with box/list/input/progress primitives rather than ad-hoc printed rows.
- `codex-claude-plugins`: statusline values should hide empty or non-actionable fields.

## Changes

### Palette

- Lowered the default `kirakira` theme brightness.
- Kept the main accent warm terracotta (`#D99178`).
- Moved the pink accent to a secondary role instead of using it as a dominant color.
- Kept green as a narrow command-prefix/status color, not a large background color.

### Motion primitives

- Changed ASCII progress from heavy `#` blocks to `=` and `.` for lower visual weight on Windows terminals.
- Changed `StatusPill` from a filled box to a bracketed inline label, reducing block noise in drawers and activity panels.

### Status bar

- Suppressed MCP status when all configured MCP servers are healthy.
- Removed compact-mode trust/session text so narrow terminals keep model and mode readable.
- Changed separators from repeated `|` glyphs to spacing, which reads cleaner in Windows Terminal and avoids the crowded OpenCode comparison screenshots.

### Composer

- Added a green `$` prompt prefix only when the input is idle/editing.
- Split the left accent into terracotta plus muted pink, matching the theme without creating a large color band.
- Kept context attachments to a single clipped line.

### Timeline and drawer

- Removed large `surfaceRaised` backgrounds from user messages, activity panels, and drawer rows.
- Preserved a one-sided accent bar for scanability.
- Kept the drawer list compact and visually closer to a structured terminal list than a stack of cards.

### Markdown rendering

- Rebalanced Markdown headings and code colors toward the Kirakira palette.
- Reduced bright pink heading usage so generated tables and long answers do not fight the rest of the UI.

## Files Changed

- `packages/cli/src/tui/theme.ts`
- `packages/cli/src/tui/motion.tsx`
- `packages/cli/src/tui/StatusBar.tsx`
- `packages/cli/src/tui/InputArea.tsx`
- `packages/cli/src/tui/Timeline.tsx`
- `packages/cli/src/tui/ContextDrawer.tsx`
- `packages/cli/src/tui/md-render.tsx`

## Verification

Passed:

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `git diff --check`

Notes:

- The first verification run exposed an unused `Box` import in `motion.tsx` after `StatusPill` stopped rendering as a filled box. The import was removed and verification was rerun successfully.
- `git diff --check` printed Windows LF/CRLF conversion warnings only; no whitespace errors were reported.
