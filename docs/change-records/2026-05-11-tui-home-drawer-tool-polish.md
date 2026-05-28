# 2026-05-11 TUI Home, Drawer, and Tool Presentation Polish

## Scope

This change tightens the main Kirakira Agent TUI interaction loop after the latest visual review. It focuses on the welcome screen, top status line, drawer selection behavior, composer breathing room, and tool-call presentation.

## Changes

- Kept the welcome screen stable when only passive startup system messages arrive.
  - MCP readiness, missing config hints, and compatible config hints no longer force the app from the welcome surface into the transcript view before the user acts.
  - The transcript still opens for real prompts, slash-command output, tool activity, errors, and restored sessions.

- Rebuilt the welcome logo.
  - Replaced the corrupted pseudo-graphic logo with solid block-letter Kirakira art.
  - Added a pink pixel heart mark above the title on wide terminals.
  - Updated the default Kirakira palette toward a brighter Morandi cherry-pink accent while keeping the low-glare dark surfaces.

- Simplified the top status bar.
  - The status line now shows only `kirakira`, current workspace folder, Git branch when present, and a short stable session alias.
  - Removed MCP counts, scroll position, mode, model, and ask-mode text from the top bar; those remain available through command/drawer surfaces or the composer metadata.

- Added breathing room to the composer.
  - The composer now accounts for vertical padding in its row measurement.
  - This prevents the prompt from looking vertically cramped and keeps resize calculations aligned with the rendered height.

- Removed duplicate running activity.
  - Deleted the transcript-level activity panel so the running state is shown once in the pinned composer.
  - This avoids two competing `running` surfaces at the bottom of the screen.

- Reworked drawer interaction and styling.
  - Added drawer selection state, keyboard up/down movement, and Enter activation.
  - Session rows can now be selected and resumed from the drawer.
  - Drawer rows now use one consistent surface layer with a slim accent rail and a clear selected marker, reducing the prior mixed-background overlap.

- Improved session restoration.
  - Session resume now restores prompt and assistant timeline content when available.
  - Future assistant responses are persisted in `response.complete.data.text` so later session restore has real transcript content rather than usage-only metadata.

- Refined tool cards.
  - Tool rows no longer render bracketed `[running]` / `[tool]` style labels.
  - The header now uses a cleaner `running/done/failed` state plus tool area and method.
  - Tool name parsing now handles slash-separated MCP names such as `fs / grep`.

## Validation

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `pnpm.cmd vitest run test\tui\layout-stability.test.ts test\tui\mouse.test.ts test\unit\cli\tui`

## Notes

- Old sessions that were written before assistant text persistence may only restore user prompts and available event metadata. New sessions will include assistant text for future restoration.
