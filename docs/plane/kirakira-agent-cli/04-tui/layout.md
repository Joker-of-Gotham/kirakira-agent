# TUI layout

The layout below is the **recommended** structure for the future Ink app. Names mirror typical agent CLIs and map cleanly onto existing event types.

## Regions (top → bottom)

1. **Status bar** — Workspace, model, sandbox mode, session id (`ses_*`), trace id (`trc_*` when `show_trace_ids` in `agentTomlSchema`, `packages/core/src/schemas/config.ts`).
2. **Timeline** — Scrollable `OutputEvent` list (human or compact rendering; same shapes as `outputEventSchema`).
3. **Context panel** — Collapsible: active skills, connected MCP servers, token counts (`ExecResult.usage` fields).
4. **Approval strip** — Inline cards when `pending: ApprovalCard[]` (`packages/core/src/types/approval.ts`).
5. **Input box** — Multiline editor; feeds `routeInput` (`input-pipeline.ts`).
6. **Hotkey bar** — One-line legend for global keys and approval shortcuts.

## Responsiveness

- **Narrow terminals** — Hide context panel; fold timeline tool JSON behind “expand”.
- **Vim mode** — `agent.toml` `ui.vim_mode` toggles modal editing (schema in `schemas/config.ts`).

## Styling

`packages/cli/src/output/human.ts` uses **chalk** for non-TUI stdout; Ink should adopt a small design token map (muted, accent, error) for parity between `--human` and fullscreen UI.

## Session resume

`session resume` (`packages/cli/src/commands/session/resume.ts`) should eventually attach to the same component tree with hydrated transcript from `packages/cli/src/session/store.ts` (`readSessionEvents`).
