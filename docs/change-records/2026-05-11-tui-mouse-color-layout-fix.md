# TUI mouse, color, and layout fix

Date: 2026-05-11

## Problems

The current formal interaction page still had three visible regressions:

1. Mouse clicks and wheel events could appear in the composer as raw terminal escape text.
2. TUI colors could disappear when running through the Docker runtime.
3. Thinking/tool-call cards could wrap their first line because status text and side decoration competed with the main content width.

## Root causes

### Mouse input

`packages/cli/src/tui/mouse.ts` only parsed full SGR mouse events that included the ESC prefix, for example:

```text
ESC [ < 64 ; 12 ; 20 M
```

In Windows Terminal plus Docker Compose plus Ink, the input can arrive without the ESC byte or split across multiple `useInput` callbacks, for example:

```text
[<64;12;
20M
```

Those fragments were not recognized as terminal control input, so the key handler treated them as printable composer text.

### Color output

The runtime container did not guarantee `FORCE_COLOR`, `COLORTERM`, or a color-capable `TERM`. Chalk/Ink can therefore disable color when the nested Docker TTY cannot be detected reliably.

### Card layout

Tool and activity cards used an inline text side marker plus a right-aligned status block. On narrower terminals, that could force the first content row to wrap even though the main transcript still had enough space.

## Changes

### Mouse

Updated `packages/cli/src/tui/mouse.ts`:

- Added support for SGR mouse sequences without an ESC prefix.
- Added support for split mouse sequences through `TuiMouseInputDecoder`.
- Classified CSI terminal control sequences as non-printable input.
- Preserved normal numeric text input, so values such as `123` are still accepted by the composer.

Updated `packages/cli/src/tui/App.tsx`:

- Replaced direct one-shot mouse parsing with a persistent `TuiMouseInputDecoder`.
- Consumes mouse/control fragments before they reach `handleKey()`.
- Keeps wheel scrolling and click focus behavior in the same single TUI input path.

Updated `test/tui/mouse.test.ts`:

- Covers ESC-less mouse events.
- Covers split mouse events.
- Guards against accidentally swallowing ordinary numeric text.

### Color

Updated:

- `packages/cli/src/commands/chat.ts`
- `scripts/kirakira-container.mjs`
- `Dockerfile`
- `docker-compose.yml`

The formal TUI now defaults to:

```text
FORCE_COLOR=3
COLORTERM=truecolor
TERM=xterm-256color
```

`chat.ts` also removes `NO_COLOR` for the formal TUI unless `KIRAKIRA_ALLOW_NO_COLOR=1` is explicitly set.

### Layout

Updated `packages/cli/src/tui/Timeline.tsx`:

- Tool cards, message cards, and active thinking/tool panels now use an explicit row layout.
- The left accent is a fixed-width background column instead of inline text.
- Tool status is placed before the title instead of right-aligning against it.
- Activity previews are clipped to one row instead of pushing the first line down.

Updated `packages/cli/src/tui/App.tsx`:

- Timeline wrapping now reserves a clearer fixed chrome width so card decoration does not compete with content.

## Verification

Passed:

- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd vitest run test\tui\mouse.test.ts test\unit\cli\tui\key-handler.test.ts`
- `node --check scripts\kirakira-container.mjs`
- `pnpm.cmd --filter @kirakira/cli build`
- `docker compose config --quiet`
- `node --check scripts\kirakira.mjs`
- `pnpm.cmd start -- --help`
- `pnpm.cmd start -- --help` again, confirming the second run did not rebuild the runtime image

Manual visual check still recommended:

- `pnpm.cmd start`
