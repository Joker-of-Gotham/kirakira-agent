# TUI architecture

This directory documents the current Ink-based terminal UI implementation.

It is not a future target anymore. The files under `packages/cli/src/tui` are the active interface that users see when they run `pnpm start`.

## Current goals

The TUI is trying to hold four things at once without collapsing:

- long markdown answers
- structured tool activity
- interactive setup and toggle panels
- a stable bottom composer that survives resize and scroll pressure

## Core files

| File | Responsibility |
| --- | --- |
| `packages/cli/src/tui/App.tsx` | top-level layout, height budgeting, panel orchestration, runtime state |
| `packages/cli/src/tui/Timeline.tsx` | transcript row accounting, scroll slicing, tool detail expansion |
| `packages/cli/src/tui/md-render.tsx` | markdown block parsing and terminal row rendering |
| `packages/cli/src/tui/InputArea.tsx` | bottom composer, caret handling, prompt dock |
| `packages/cli/src/tui/key-handler.ts` | keyboard routing, history, scroll, expansion, cursor edits |
| `packages/cli/src/tui/mouse.ts` | mouse event decoding and wheel handling |
| `packages/cli/src/tui/ProviderSetup.tsx` | provider key flow and model selection UI |
| `packages/cli/src/tui/SidebarPanel.tsx` | panel rendering for MCP and related drawers |
| `packages/cli/src/tui/ContextDrawer.tsx` | file/context side panel |
| `packages/cli/src/tui/HomeScreen.tsx` | landing view before active transcript use |
| `packages/cli/src/tui/motion.tsx` | lightweight motion primitives for status and transitions |
| `packages/cli/src/tui/hooks/useTicker.ts` | frame ticker for animated UI state |

## Render model

The current UI does not treat an assistant message as a single opaque block.

Instead, the path is:

1. timeline items are normalized
2. assistant content is rendered into markdown blocks
3. blocks are expanded into visual rows
4. the viewport slices those rows by `scrollOffset`
5. the timeline renders only the visible slice

That design is the reason the app can now:

- scroll long answers line by line
- keep the composer visible under resize pressure
- trim oversized cards without losing the entire bottom dock

## Tool cards

Tool activity is deliberately not rendered as raw JSON blobs.

The current tool presentation model is:

- first line: command area and execution mode
- second line: target object
- preview lines: compact result summary
- expansion: detailed transcript on demand

The expansion path is tied to `ctrl+r` rather than a large hotkey surface. Most other operational panels are intended to be opened through slash commands.

## Markdown support

`md-render.tsx` is responsible for the final assistant transcript shape.

The current renderer covers:

- headings
- paragraphs
- emphasis
- inline code
- fenced code blocks
- lists
- block quotes
- rules
- tables with terminal borders

The important implementation constraint is that markdown rendering must produce stable row counts. Layout bugs in the recent TUI work almost always came from row-estimation drift.

## Input model

`InputArea.tsx` and `key-handler.ts` together own the composer.

The current behavior includes:

- left/right cursor movement
- editable prompt text
- history navigation
- slash command handoff
- scroll shortcuts
- tool expansion shortcuts

The bottom dock is treated as reserved layout space, not as transcript content.

## Mouse model

`mouse.ts` decodes terminal mouse sequences before they fall into the text input path.

The current expectation is:

- wheel events scroll the timeline
- mouse escape sequences do not appear as garbage in the composer
- scroll movement is one row per tick rather than coarse item jumps

## Theme and motion

The active theme direction is muted Morandi tones rather than bright terminal palettes.

Relevant files:

- `packages/cli/src/tui/theme.ts`
- `packages/cli/src/tui/config.ts`
- `packages/cli/src/tui/motion.tsx`

The design target is restrained contrast with clear block separation: background surfaces, narrow accent rails, and stable card geometry.

## What to verify after changes

If you touch the TUI, verify all of these:

1. the composer stays visible while the transcript grows
2. long markdown scrolls by rows
3. fenced code and tables render as blocks
4. tool cards preview cleanly before expansion
5. wheel scroll does not insert escape noise into the input
6. narrow and wide terminal widths both remain usable

## Related docs

- [CLI plane root](../README.md)
- [Architecture overview](../../../architecture.md)
- [Change records](../../../change-records/README.md)
