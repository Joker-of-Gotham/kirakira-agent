# Session lifecycle

## States (`SessionStatus`)

Defined in `packages/core/src/types/session.ts`: `active`, `completed`, `error`, `suspended`.

`resumeSession` (`packages/cli/src/session/manager.ts`) infers status from the tail event:

- Last `session.finish` → `completed`
- Last `error` → `error`
- Otherwise → `active`

> **`suspended`** is part of the type system for future explicit checkpointing; wire events when pause/resume ships.

## Operations

| Operation | API | Notes |
|-----------|-----|-------|
| Create | `createSession` | Emits `session.start` event |
| Active | Streaming REPL/exec | Append events via `appendSessionEvent` |
| Suspend | (planned) | Should write marker event + flip status |
| Resume | `resumeSession` | CLI `session resume` (`commands/session/resume.ts`) |
| Complete | (planned) | Emit `session.finish` |

## Modes (`SessionMode`)

`repl`, `exec`, `plan`, `ask`, `shell` — set on start (`createSession` stores in first event `data`).

## Pruning

`pruneSessions` deletes old files based on mtime; respects `keepActive` flag.
