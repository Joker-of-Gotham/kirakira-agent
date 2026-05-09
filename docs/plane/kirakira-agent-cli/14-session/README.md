# Session management

Sessions group prompts, tool calls, and approvals under a **`sessionId`** (`ses_*`) and **`traceId`**.

## Types

`Session`, `SessionEvent`, `SessionMode`, `SessionStatus`, `SessionEventType` — `packages/core/src/types/session.ts`.

## Persistence

`packages/cli/src/session/store.ts`:

- Files live under `getUserSessionsDir()` (`packages/core/src/utils/paths.ts`).
- Filename pattern: `sessionFilePath` → `<safeId>.jsonl`.

## Orchestration

`packages/cli/src/session/manager.ts` provides:

- `createSession` — writes initial `session.start`
- `resumeSession` — rebuilds `Session` view + event list
- `listSessions` — scans JSONL files
- `pruneSessions` — TTL-based deletion with optional keep-active guard

## CLI

`packages/cli/src/commands/session/` (`list`, `resume`, `export`, `prune`).

## Related docs

- [Lifecycle](./lifecycle.md)
- [Persistence](./persistence.md)
- [Context management](./context-management.md)
