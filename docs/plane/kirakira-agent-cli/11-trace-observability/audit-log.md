# Audit log format

## Type definition

`AuditEntry` — `packages/core/src/types/trace.ts`:

| Field | Type | Notes |
|-------|------|-------|
| `ts` | ISO string | Event time |
| `traceId` | string | Correlates with OTel trace |
| `runId` | string | Run/session batch id |
| `userId`, `agentId`, `subagent` | optional strings | Actor metadata |
| `skill`, `tool` | optional strings | What ran |
| `approvalTicket` | optional string | ties to approval ids (`apr_*` prefix) |
| `decision` | `approved` \| `denied` \| `blocked` | Policy outcome |
| `inputHash`, `outputHash` | optional string | Redacted digest |
| `tokenIn`, `tokenOut`, `costUsd` | optional numbers | Usage |
| `status` | `success` \| `error` \| `pending` | Lifecycle |

## Writer

`appendAuditEntry(entry, filePath?)` — `packages/cli/src/trace/audit.ts` defaults to `${getUserTracesDir()}/audit.jsonl`.

## File format

One JSON object per line (JSONL), append-only—safe for log shippers (`fluent-bit`, `vector`).

## Relationship to JSONL output events

CLI streaming events use `outputEventSchema` (`packages/core/src/schemas/output.ts`) for tool UX; audit entries are compliance-focused and may duplicate trace ids without duplicating full payloads.
