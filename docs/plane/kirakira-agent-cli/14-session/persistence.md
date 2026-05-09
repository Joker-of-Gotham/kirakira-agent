# Session persistence (JSONL)

## On-disk format

Each session is append-only **JSONL** (`packages/cli/src/session/store.ts`):

- One `SessionEvent` JSON object per line
- Helper functions: `appendSessionEvent`, `readSessionEvents`

## Event typing

`SessionEvent` (`packages/core/src/types/session.ts`) requires:

- `ts`, `event`, `sessionId`, `traceId`
- optional `spanId`, `data`

Event names include transcript lifecycle (`prompt.submit`, `response.*`), tool calls (`mcp.*`, `shell.*`), approvals, `error`, and **`context.compact`**.

## ID sanitization

`sessionFilePath` replaces unsafe characters in ids before filename use to avoid path issues.

## Portability

Sessions directory defaults under `~/.kirakira/sessions` (`PATHS.userSessions`). Override with `root` parameter in store/manager APIs for tests.

## Export command

`session export` (`commands/session/export.ts`) should package JSONL + metadata for sharing (implementation evolves alongside privacy redaction).
