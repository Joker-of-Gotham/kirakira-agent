# Exec JSON output

## Final envelope

`serializeExecJson` (`packages/cli/src/output/json.ts`) validates:

```json
{
  "kind": "exec.result",
  "result": { /* ExecResult */ }
}
```

via `execJsonEnvelopeSchema` (`event-schema.ts`).

## `ExecResult` shape (`execResultSchema`)

Defined in `packages/core/src/schemas/output.ts`:

- `sessionId` (`ses_` prefix)
- `traceId` (min length 16)
- `status` — `ok` | `error`
- `mode` — literal `exec`
- Optional `result` `{ summary, artifacts[] }`
- Optional `error` `{ code, message }`
- Optional `usage` `{ tokenIn, tokenOut, costUsd, durationMs }`

## Example

```json
{
  "kind": "exec.result",
  "result": {
    "sessionId": "ses_...",
    "traceId": "................",
    "status": "ok",
    "mode": "exec",
    "result": {
      "summary": "Executed prompt: ...",
      "artifacts": []
    },
    "usage": {
      "tokenIn": 0,
      "tokenOut": 0,
      "costUsd": 0,
      "durationMs": 0
    }
  }
}
```

Downstream parsers should accept additional fields only when schema versions bump (`SCHEMA_VERSIONS` in `constants.ts`).
