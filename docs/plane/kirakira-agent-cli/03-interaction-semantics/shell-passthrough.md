# Shell passthrough (`!`)

Shell integration is parsed by **`parseShellInput`** in `packages/cli/src/parser/shell.ts`. When the first character is `!`, the result is a **`ShellParseResult`** with a **discriminated `variant`**.

## Variants

| Input pattern | `variant` | Notes |
|---------------|-----------|--------|
| `!` alone | `{ variant: "toggle" }` | Enter/exit shell mode in UI |
| `!!` | `{ variant: "repeat_last" }` | Caller replays last command from history |
| `! --host <cmd>` | `{ variant: "host", command, needsApproval: true }` | **Host** execution |
| `!<cmd>` or `! <cmd>` | `{ variant: "oneshot", command, needsApproval: false }` | Sandboxed workspace command |

The file’s docstring is the authoritative specification.

## Approval hooks

- **Host** commands set `needsApproval: true` unconditionally—these must pass policy (`packages/cli/src/config/policy-yaml.ts` `shell.hostExecution`) and approval cards (`packages/cli/src/approval/card-builder.ts` `buildShellApprovalCard`).
- **Oneshot** commands default `needsApproval: false`; policy may still elevate risk based on matcher (`policy-matcher.ts`) or enterprise rules.

## Integration with `routeInput`

`packages/cli/src/parser/input-pipeline.ts` routes `!` lines to `parseShellInput` before `@` mentions, so `!echo hi` is never interpreted as a prompt.

## Telemetry

Successful shell execution should emit spans `shell.exec` and JSONL `shell.executed` per `SPAN_NAMES` / `OUTPUT_EVENTS` in `packages/core/src/constants.ts` and `schemas/output.ts`.

## Testing ideas

Unit tests should cover: bare `!`, `!!`, `--host` with extra spaces, and commands without leading space after `!` (`parseShellInput` uses `rest.startsWith(" ")` to decide trimming).
