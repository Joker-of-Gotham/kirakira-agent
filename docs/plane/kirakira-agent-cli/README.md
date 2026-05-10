# kirakira-agent CLI documentation plane

This plane documents the current command-line and terminal UI surface for `@kirakira/cli`.

The CLI is no longer just a command parser. In the current repo, it is the product surface that ties together:

- the interactive chat experience
- provider setup and model discovery
- MCP management
- policy visibility
- transcript rendering
- session-scale terminal interaction

## Current entrypoints

At the repository root:

```bash
pnpm start
pnpm start -- chat
pnpm start -- mcp list
pnpm start -- mcp add <server>
```

Inside the runtime container, the binary is `kirakira-agent`.

## Important source areas

| Area | Primary files |
| --- | --- |
| command registration | `packages/cli/src/commands` |
| interactive chat command | `packages/cli/src/commands/chat.ts` |
| MCP command family | `packages/cli/src/commands/mcp/*` |
| TUI shell | `packages/cli/src/tui/App.tsx` |
| timeline and rendering | `packages/cli/src/tui/Timeline.tsx`, `packages/cli/src/tui/md-render.tsx` |
| input and key handling | `packages/cli/src/tui/InputArea.tsx`, `packages/cli/src/tui/key-handler.ts`, `packages/cli/src/tui/mouse.ts` |
| provider setup | `packages/cli/src/tui/ProviderSetup.tsx`, `packages/cli/src/gateway/provider-catalog.ts` |

## CLI design rules

The current CLI direction is shaped by a few rules:

- the primary path is interactive, not print-and-exit
- `pnpm start` is the canonical launcher
- non-chat commands should still be able to run through the same runtime path
- MCP and provider setup should be part of the same UX, not separate hidden systems

## Reading order

If you are changing the interactive experience:

1. read [04-tui](./04-tui/README.md)
2. inspect `App.tsx`
3. inspect `Timeline.tsx` and `md-render.tsx`
4. inspect `InputArea.tsx`, `key-handler.ts`, and `mouse.ts`

If you are changing provider setup:

1. inspect `packages/cli/src/gateway/provider-catalog.ts`
2. inspect `packages/cli/src/tui/ProviderSetup.tsx`
3. inspect the chat command integration path

If you are changing MCP behavior:

1. inspect `packages/cli/src/commands/mcp/*`
2. inspect `packages/cli/src/tui/hooks/useMcp.ts`
3. inspect `packages/mcp-adapter`

## Section map

- `01-foundation`: CLI package shape and runtime contract
- `02-command-system`: command families and registration
- `03-interaction-semantics`: slash/context/shell interaction rules
- `04-tui`: current TUI implementation
- `05-config-system`: config merge and resolution
- `06-skills`: skill-facing interaction rules
- `07-mcp`: MCP command surface
- `08-compat`: compatibility layer
- `09-registry`: registry-related command and package behavior
- `10-approval-security`: approval path and policy visibility
- `11-trace-observability`: trace output and observability hooks
- `12-output-contracts`: machine/human output shape
- `13-plugin-system`: plugin and extension surface
- `14-session`: session lifecycle
- `15-testing`: CLI/TUI coverage
