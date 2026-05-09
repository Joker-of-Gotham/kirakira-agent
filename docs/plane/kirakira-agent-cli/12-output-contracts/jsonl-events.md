# JSONL event stream

## Schema

Each line must satisfy **`outputEventSchema`** (`packages/core/src/schemas/output.ts`):

- `ts` — ISO-8601 datetime string
- `event` — one of `outputEventType` enum values
- `sessionId` — `ses_` prefix
- `traceId` — string (min length 16)
- optional `data` — arbitrary JSON object

## Event types

Aligned with **`OUTPUT_EVENTS`** in `packages/core/src/constants.ts`:

1. `session.start`
2. `session.finish`
3. `attachment.resolved`
4. `skill.activated`
5. `mcp.invoke`
6. `approval.requested`
7. `approval.decided`
8. `shell.executed`
9. `output.artifact`
10. `error`

## Serialization helpers

`serializeOutputEventJsonl` / batch variant — `packages/cli/src/output/jsonl.ts` — parse-defensive: invalid events throw Zod errors early.

## Exec mode bootstrap

`kirakira-agent exec --jsonl` currently emits minimal `session.start` / `session.finish` lines (`commands/exec.ts`); full tool streams should reuse the same schema for consistency.

## Typing

`OutputEvent` — `packages/core/src/types/output.ts`; tests should snapshot golden JSONL fixtures under `tests/fixtures` once added.
