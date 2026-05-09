# TUI component catalog (target)

Components are **named targets** for an Ink implementation; today, logic lives in the CLI modules cited.

## Shell and status

| Component | Responsibility | Existing code |
|-----------|----------------|---------------|
| **StatusBar** | Model, cwd, sandbox, trace display | Config: `agentTomlSchema.ui` |
| **ConnectionDots** | MCP online/offline | `packages/mcp-adapter/src/health.ts` |

## Timeline and output

| Component | Responsibility | Existing code |
|-----------|----------------|---------------|
| **Timeline** | Virtualized event list | `formatOutputEventHuman` (`output/human.ts`) |
| **ToolFold** | Collapse `mcp.invoke` payloads | JSONL `mcp.invoke` events |
| **ErrorBanner** | Terminal-safe errors | `EamError` hierarchy (`core/errors.ts`) |

## Context

| Component | Responsibility | Existing code |
|-----------|----------------|---------------|
| **ContextPanel** | Skills + MCP roster | `discoverSkills` (`skill-runtime/discovery.ts`) |
| **AttachmentChips** | Parsed `@` mentions | `parser/mention.ts` |

## Input

| Component | Responsibility | Existing code |
|-----------|----------------|---------------|
| **InputBox** | Multiline prompt | Routed via `input-pipeline.ts` |
| **SlashPalette** | Autocomplete `/` cmds | `parser/slash.ts` `SLASH_COMMANDS_ARRAY` |

## Approval

| Component | Responsibility | Existing code |
|-----------|----------------|---------------|
| **ApprovalCard** | Render risk + actions | `core/types/approval.ts` |
| **ShellApprovalView** | Command diff | `buildShellApprovalCard` |
| **McpApprovalView** | Server/tool/url | `buildMcpApprovalCard` |
| **WriteApprovalView** | Path + preview | `buildWriteApprovalCard` |

## Plugin hooks

Renderer plugins (`RendererAdapter` in `packages/cli/src/plugin/types.ts`) may supply alternate **Timeline** renderers without forking core components.
