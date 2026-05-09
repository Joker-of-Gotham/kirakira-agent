# Human-readable output

**Module:** `packages/cli/src/output/human.ts` (uses `chalk`).

## `formatOutputEventHuman(ev: OutputEvent)`

- Prefix: dim timestamp + cyan event name
- Suffix: dim `sessionId` + `traceId`
- OptionalIndented JSON for `data` in gray

## `formatExecResultHuman(res: ExecResult)`

- Badge: green `[ok]` or red `[error]`
- Headline includes session + trace ids (yellow)
- On success, prints summary + artifact list (dim)
- On failure, prints `error.code` and message in red

## When used

`kirakira-agent exec` without `--json`/`--jsonl` prints simple lines today (`commands/exec.ts`); human formatters provide parity for richer event streams in future command outputs.

## folded tool events

Tool traces should collapse large JSON arguments in the presenter layer (TUI timeline) while stderr continues to use these formatters for CI logs.
