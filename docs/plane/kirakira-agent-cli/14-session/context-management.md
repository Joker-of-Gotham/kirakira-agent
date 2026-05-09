# Context management and `/compact`

## Slash command

`/compact` is part of `SLASH_COMMANDS_ARRAY` (`packages/cli/src/parser/slash.ts`). It should trigger **context compression**—summarizing or truncating history while preserving tool outcomes.

## Event hook

Emit `context.compact` session events (`SessionEventType` in `packages/core/src/types/session.ts`) so exports remain auditable.

## Policy considerations

Compression may drop secrets—ensure summaries respect `policy.privacy.redactEnv` and enterprise data loss policies.

## Model gateway

Long contexts might offload rolling summaries to the Python gateway (`packages/model-gateway/src/kirakira_model_gateway/server.py` `handle_complete`) using cheaper models; CLI orchestration TBD.

## Future work

Wire `routeInput` slash handling to session manager + model layer; until then, `/compact` is a recognized token only.
