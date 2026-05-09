# Mention syntax (`@`)

Mentions attach context to a prompt. **`classifyMentionToken`** and **`parseMentions`** live in `packages/cli/src/parser/mention.ts`.

## Attachment model

```ts
type AttachmentKind = "file" | "skill" | "mcp" | "session" | "trace";

interface Attachment {
  kind: AttachmentKind;
  path: string;
  namespace: string;
  digest: string;
}
```

`digest` is a **deterministic** SHA-256 of the canonical mention key until filesystem/content resolution completes (`sha256Hex` from `@kirakira/core`).

## Classification rules

Tokens are passed **without** the leading `@`. Priority (from code comments):

1. **`session/<id>`** → `kind: "session"`, `namespace: "session"`.
2. **`trace/<id>`** → `kind: "trace"`, `namespace: "trace"`.
3. **`mcp/<server>:<resource>`** — requires a colon separating server and resource; `kind: "mcp"`, `namespace: "mcp"`, `path` is `"server:resource"`.
4. **`skill/<name>`** → `kind: "skill"`, `namespace: "skill"`.
5. **Anything else** → treated as a **file path**, `kind: "file"`, `namespace: "file"`.

Invalid structured prefixes (empty id, missing colon for MCP) yield `null` for that token.

## Multiple mentions

`parseMentions` scans the input for `@` tokens and returns every resolved attachment; callers may also receive the raw `remainder` from `routeInput` (`input-pipeline.ts`) for text outside mentions.

## Downstream resolution

- **File** attachments should use `isPathWithin` and workspace roots from `packages/core/src/utils/paths.ts` to mitigate traversal (`PathTraversalError` in `packages/core/src/errors.ts`).
- **Skill** attachments tie into discovery (`packages/skill-runtime/src/discovery.ts`).
- **Session** / **trace** attachments map to IDs with prefixes `ses_` / `trc_` per `ID_PREFIX` in `packages/core/src/constants.ts`.

## Example tokens

- `@src/index.ts` — file
- `@skill/explain-codebase` — skill
- `@mcp/files:read_file` — MCP resource
- `@session/ses_abc123` — session
- `@trace/trc_def456` — trace
