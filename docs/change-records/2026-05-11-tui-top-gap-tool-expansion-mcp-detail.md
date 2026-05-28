# 2026-05-11 TUI Top Gap, Tool Expansion, and MCP Detail Polish

## Scope

This change addresses the next round of terminal UI issues found during real interactive use. It focuses on spacing below the top status bar, readable tool result previews, reliable expanded tool details, branch marker portability, inline-code spacing, and MCP drawer detail navigation.

## Changes

- Added a real gap between the top status bar and transcript content.
  - The app now reserves one extra row after the status bar in both layout budgeting and rendering.
  - This prevents transcript cards from touching the status line when the user scrolls or restores a long session.

- Made the Git branch marker terminal-safe.
  - Replaced the Nerd Font private-use branch glyph with an ASCII `@` marker.
  - This avoids mojibake on Windows terminals and non-Nerd-Font setups while keeping the branch label compact.

- Improved tool result parsing.
  - Tool completion parsing now detects the latency segment from the right side of the header, so tool names containing spaces or slashes no longer leak `32ms {` into the preview.
  - MCP wrapper objects containing `args` plus `content`, `result`, `output`, `structuredContent`, or `error` are unwrapped before summarization.
  - This keeps cards focused on the useful payload instead of dumping transport JSON.

- Made Ctrl+R tool expansion useful for long results.
  - Expanded tool cards now use a much higher result-line budget and wrap long rows to the visible card width.
  - Collapsed cards still keep concise previews, while expanded cards preserve enough content to inspect long file reads and search output through normal transcript scrolling.

- Added a real MCP drawer detail level.
  - Enter on an MCP server now opens a second-level tools view for that server.
  - Up/Down navigates the internal tool list instead of continuing to move between top-level servers.
  - The selected tool shows alias, native tool name, read/write mode, risk level, description, and input schema summary.

- Tightened inline-code rendering.
  - Inline code tokens now include visual padding inside their background span.
  - This prevents list numbers and adjacent text from visually colliding with code backgrounds in dense Markdown output.

## Validation

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd --filter @kirakira/cli build`
- `pnpm.cmd vitest run test\tui\layout-stability.test.ts test\tui\mouse.test.ts test\unit\cli\tui\timeline-lines.test.ts test\unit\cli\tui\md-render.test.ts`

## Notes

- The branch marker deliberately uses ASCII instead of a Powerline or Nerd Font symbol. The UI should remain readable on a plain Windows terminal without requiring a patched font.
- Ctrl+R expansion still respects the transcript viewport. Long expanded tool results are meant to be inspected through line-by-line scrolling rather than by forcing a single card to occupy the entire screen.
