# TUI architecture (Ink / React)

The **interactive** experience (full-screen terminal UI) is specified alongside the agent platform; **command-line parsing and approval types already exist**, while a dedicated Ink application may ship in a future revision. This page describes the **target** layout so contributors align new React components with existing semantics (`/`, `@`, `!`) and approval flows.

> **Current code touchpoints:** input routing `packages/cli/src/parser/input-pipeline.ts`; approval cards `packages/core/src/types/approval.ts` + `packages/cli/src/approval/card-builder.ts`; session resume command `packages/cli/src/commands/session/resume.ts` (routes into session store when used).

## Why Ink

**Ink** provides React-style components in the terminal—ideal for:

- Stateful layouts (status bar + scroll regions)
- Keyboard event routing
- Streaming output (JSONL formatter hooks from `packages/cli/src/output/jsonl.ts` / `human.ts`)

## Data flow (target)

1. Raw stdin → `routeInput` → event union.
2. Model / tool events → `OutputEvent` stream (`packages/core/src/schemas/output.ts`).
3. Pending approvals → `ApprovalCard` list in session state (`types/approval.ts`).
4. Trace context → `withSpan` helpers (`packages/cli/src/trace/spans.ts`).

## Related sections

- [Layout](./layout.md)
- [Components](./components.md)
- [Keybindings](./keybindings.md)
