# Runtime Orchestration Topology

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Why

Subagent execution already had important primitives: delegate bridge, lane
capacities, capability scopes, and runtime events. The missing layer was a
declarative topology contract that could describe lanes, roles, and handoff
edges without baking those choices into `LaneRouter` or daemon env parsing.

The design follows the same boundary used by the current reference systems:

- OpenAI Agents SDK models handoffs as explicit, typed transfers with optional
  input filtering and guardrails:
  https://openai.github.io/openai-agents-js/guides/handoffs/
- LangGraph documents multi-agent supervisor and swarm patterns as distinct
  topologies rather than one fixed routing rule:
  https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/
- Docker Compose and Node environment rules keep runtime defaults overridable by
  env/profile selection:
  https://docs.docker.com/compose/how-tos/environment-variables/envvars-precedence/
  https://nodejs.org/api/environment_variables.html

## What Changed

- Added public config types and schema for `orchestration.topology`:
  lanes, roles, handoffs, default role, and topology mode.
- Added a runtime profile topology contract in
  `configs/runtime/profiles.json`.
- Projected profile topology into `ResolvedRuntimeProfileState.orchestration`.
- Taught `scripts/runtime-profile.mjs` to merge global/profile orchestration
  config so Docker/local/workbench launchers see the same topology contract.
- Updated daemon config compilation so resolved topology lanes become kernel
  lane capacities, while legacy `orchestration.max_concurrency` still overrides
  the delegated lane for backward compatibility.
- Kept parent worker defaults compatible with legacy
  `default_subagent_turns` and `subagent_system_preamble`, with future support
  for default-role model/system/turn overrides.

## Validation

- `pnpm.cmd --filter @kirakira/core build`
- `pnpm.cmd --filter @kirakira/core typecheck`
- `pnpm.cmd --filter @kirakira/config-resolver typecheck`
- `pnpm.cmd --filter @kirakira/config-resolver build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd exec vitest run test/contract/config/resolved-state-schema.test.ts test/unit/config-resolver/resolved-state.test.ts test/unit/runtime/profile-resolution.test.ts test/unit/runtime-daemon/daemon-config.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/orchestrator-kernel/task-executor.test.ts`

## Remaining Work

- Make `LaneRouter` role-aware so subagent tasks can request a topology role or
  lane instead of using only `node.kind`.
- Project topology role and handoff edge IDs into subagent lifecycle events and
  event-store lineage.
- Feed topology roles into PEP context instead of emitting empty `roles`.
- Replace delegate runtime `DisabledAuditWriter` with the same profile-backed
  audit writer used by direct daemon MCP calls.
