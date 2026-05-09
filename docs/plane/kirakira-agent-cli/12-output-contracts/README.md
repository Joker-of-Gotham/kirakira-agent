# Output contracts

Outputs must satisfy schemas in `packages/core/src/schemas/output.ts` and serializers in `packages/cli/src/output/`.

## Modules

| File | Role |
|------|------|
| `human.ts` | chalk formatters for humans |
| `json.ts` | `serializeExecJson` wraps `execJsonEnvelopeSchema` |
| `jsonl.ts` | `serializeOutputEventJsonl` |
| `event-schema.ts` | Re-exports Zod schemas + `execJsonEnvelopeSchema` |

## Modes

`agent.toml` `output.default` / `exec_default` choose `human`, `json`, or `jsonl` (`schemas/config.ts`).

## Related docs

- [Human output](./human-output.md)
- [JSON output](./json-output.md)
- [JSONL events](./jsonl-events.md)
