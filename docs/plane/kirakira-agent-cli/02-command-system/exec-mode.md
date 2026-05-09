# Non-interactive exec mode

The **`kirakira-agent exec`** command (`packages/cli/src/commands/exec.ts`) runs a **single prompt** without the interactive REPL. It is the integration point for CI, scripts, and automation.

## Flags

| Flag | Type | Description |
|------|------|-------------|
| `-p`, `--prompt` | string | Prompt text |
| positional `prompt` | string | Alternative to `-p` (oclif `Args`) |
| `-m`, `--model` | string | Model id (forwarded to runtime) |
| `-c`, `--config` | string | Path to `agent.toml` |
| `--json` | boolean | Emit one final JSON result (exclusive with `--jsonl`) |
| `--jsonl` | boolean | Emit JSON Lines events (exclusive with `--json`) |
| `--timeout` | integer | Timeout in **seconds** (default `300`) |

## Behavior

1. Parses args; requires a prompt from flag or position.
2. Generates **`sessionId`** and **`traceId`** via `@kirakira/core` (`generateSessionId`, `generateTraceId`).
3. Builds an **`ExecResult`** object typed from `@kirakira/core` (`status`, `mode: "exec"`, optional `result` / `error`, `usage`).

### Human mode (default)

Prints session id, trace id, status, and summary text—useful for quick local checks.

### `--json`

Logs `JSON.stringify(result, null, 2)`. The canonical schema is `execResultSchema` in `packages/core/src/schemas/output.ts`. The CLI also defines `execJsonEnvelopeSchema` in `packages/cli/src/output/event-schema.ts` (`kind: "exec.result"` + `result`) for streamed tooling.

### `--jsonl`

Emits at minimum:

- A `session.start` line with `ts`, `sessionId`, `traceId`.
- A `session.finish` line with `data.status`.

These event names align with `OUTPUT_EVENTS` / `outputEventType` in `packages/core/src/schemas/output.ts` and `packages/core/src/constants.ts`.

## Timeouts

`--timeout` is expressed in seconds in the oclif flag definition; downstream execution should convert to milliseconds when calling subprocess or HTTP clients (integration points in MCP and model layers).

## Related code

- Result typing: `packages/core/src/types/output.ts`
- Human formatter: `packages/cli/src/output/human.ts` (`formatExecResultHuman`)
