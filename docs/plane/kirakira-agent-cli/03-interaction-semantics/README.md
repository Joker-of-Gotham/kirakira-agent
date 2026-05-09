# Interaction semantics: `/`, `@`, `!`

User input is classified **before** model invocation. The single entry point is **`routeInput`** in `packages/cli/src/parser/input-pipeline.ts`:

1. Trim leading whitespace.
2. If input starts with **`/`** → slash command (`parseSlashInput`).
3. Else if **`!`** → shell passthrough (`parseShellInput`).
4. Else if **`@`** → mention attachments (`parseMentions`).
5. Else → plain **prompt** text.

This ordering matches the docstring in `input-pipeline.ts` and ensures deterministic parsing for REPL-style clients.

## Event types

`routeInput` returns a discriminated union `InputEvent`:

- `{ type: "slash", result: SlashParseResult }`
- `{ type: "shell", result: ShellParseResult }`
- `{ type: "mention", mentions: Attachment[], remainder?: string }`
- `{ type: "prompt", text: string }`

The interactive REPL (`kirakira-agent chat`) switches on `type` and invokes slash command handlers, shell execution, mention resolution, or LLM chat accordingly.

## Security lens

Shell and MCP paths often require **approval** evaluation (`packages/cli/src/approval/`). Mention resolution computes digests for stable attachment IDs (`packages/cli/src/parser/mention.ts` uses `sha256Hex` from `@kirakira/core`).

## Related docs

- [Slash commands](./slash-commands.md)
- [Mention syntax](./mention-syntax.md)
- [Shell passthrough](./shell-passthrough.md)
