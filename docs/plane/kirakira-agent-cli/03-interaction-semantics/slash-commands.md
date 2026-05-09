# Slash commands

Slash commands are parsed by **`parseSlashInput`** in `packages/cli/src/parser/slash.ts`. Parsing only triggers when the first non-whitespace character is **`/`** (see also `routeInput` in `input-pipeline.ts`).

## Registry

`SLASH_COMMANDS_ARRAY` lists every **recognized** command name (21 entries):

1. `help`
2. `model`
3. `plan`
4. `ask`
5. `new`
6. `resume`
7. `compact`
8. `permissions`
9. `auto-run`
10. `sandbox`
11. `mcp`
12. `skills`
13. `commands`
14. `trace`
15. `export`
16. `vim`
17. `setup-terminal`
18. `usage`
19. `about`
20. `feedback`
21. `quit`

The parser returns `recognized: true` when the first token matches this set (case-sensitive per `Set` lookup).

## Parse result

```ts
interface SlashParseResult {
  command: string;
  args: string;
  recognized: boolean;
}
```

- **Empty body** after `/` → `command: ""`, `recognized: false`.
- **Tokenization** — First whitespace separates command from `args` (remainder trimmed).

## Definitions (behavioral)

The REPL/TUI layer should map names to behavior; CLI **oclif** commands are separate (see `02-command-system/`). Suggested semantics:

| Command | Intent |
|---------|--------|
| `help` | Show interactive help |
| `model` | Select or inspect default model |
| `plan` | Planning / multi-step mode |
| `ask` | Force Q&A style turn |
| `new` | Start new session |
| `resume` | Resume session picker |
| `compact` | Context compression (`14-session/context-management.md`) |
| `permissions` | Toggle capability prompts |
| `auto-run` | Adjust auto-execution policy |
| `sandbox` | Sandbox mode UI |
| `mcp` | MCP server quick actions |
| `skills` | Skill browser |
| `commands` | Slash palette |
| `trace` | Trace ID visibility |
| `export` | Export transcript |
| `vim` | Vim keybindings |
| `setup-terminal` | Terminal integration |
| `usage` | Token / cost usage |
| `about` | Version / credits |
| `feedback` | Send feedback |
| `quit` | Exit REPL |

Implementations should live alongside the future Ink app; today, `session resume` logs TUI intent in `packages/cli/src/commands/session/resume.ts`.
