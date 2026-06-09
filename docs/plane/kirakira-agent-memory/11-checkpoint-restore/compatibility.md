# Checkpoint Repository Compatibility

Return to [`README.md`](README.md).

## Runtime boundary

The daemon kernel consumes `CheckpointRepository` from `@kirakira/event-store`.
When a resolved runtime memory profile exposes Postgres, the daemon now selects
`PostgresCheckpointEnvelopeRepository` from `@kirakira/memory-store` unless the
test harness or caller provides `kernelOptions.checkpointRepository`.

Selection order:

1. `kernelOptions.checkpointRepository`
2. profile/env-backed `PostgresCheckpointEnvelopeRepository`
3. local `FsCheckpointRepository`

The memory-backed daemon repository stores complete `CheckpointEnvelope` JSON in
`daemon_checkpoints`. The table uses text `id` and `run_id` columns because the
orchestrator kernel uses opaque ULIDs for both values.

## Service boundary

`CheckpointService` still uses the Memory API DTO shape (`MemoryCheckpoint`) and
the existing `checkpoints` table. That path handles inline state, blob spillover,
and `CheckpointRef` restore semantics.

The two tables are intentionally separate for this phase:

- `daemon_checkpoints`: event-store envelope persistence for kernel restore.
- `checkpoints`: Memory API checkpoint DTOs used by `CheckpointService`.

This avoids implicit ULID-to-UUID mapping and keeps test harnesses free to inject
in-memory repositories without requiring a live Postgres stack.

## Profile contract

The daemon checkpoint repository is enabled only when:

- memory is not disabled by `KIRAKIRA_MEMORY_ENABLED=0` or profile state,
- checkpoint persistence is not disabled by `KIRAKIRA_MEMORY_CHECKPOINTS_ENABLED=0`,
- a resolved memory profile has a `postgres` service and its `url_env` resolves,
  or `KIRAKIRA_MEMORY_CHECKPOINTS_ENABLED=1` explicitly requests it.

The default production repository fails fast if no Postgres DSN is resolved from
profile/env. It does not silently fall back to localhost for daemon checkpoints.
