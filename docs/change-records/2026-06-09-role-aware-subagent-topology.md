# Role-Aware Subagent Topology

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Why

The previous runtime profile slice made swarm topology declarative, but subagent
execution still routed every `subagent` task to the delegated lane. That kept
the topology contract mostly descriptive. This change starts making it
operational by letting normalized subagent contracts carry role and lane
metadata into routing, runtime handoff requests, event projection, and
frontend/dashboard state.

Reference constraints used for this slice:

- OpenAI Agents SDK handoffs are explicit transfers with typed input and
  handoff tooling, not free-form prompt conventions:
  https://openai.github.io/openai-agents-js/guides/handoffs/
- LangChain/LangGraph distinguishes supervisor-led subagents, handoffs, and
  router workflows, and calls out context engineering as the core multi-agent
  design problem:
  https://docs.langchain.com/oss/javascript/langchain/multi-agent
  https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs
- OpenTelemetry GenAI agent span conventions motivate preserving agent role,
  handoff, and lineage metadata as structured runtime facts:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/

## What Changed

- `PlanContext` now carries resolved orchestration topology so plan
  normalization can validate role references.
- `SubagentTaskContract` and `SubagentSpec` now preserve `role` and requested
  `lane`.
- `normalizeSubagentTaskContract` resolves lane from a known topology role.
  When a role catalog is available, raw planner lane hints are rejected unless
  they match the selected role lane. This keeps model-generated lane strings
  from bypassing topology.
- `LaneRouter` uses normalized subagent lane hints before falling back to the
  legacy `subagent -> delegated` rule.
- `daemon-config` passes resolved profile topology into kernel plan context,
  not just lane capacities.
- Kernel subagent lifecycle events, agent-runtime delegate requests,
  event-store projection, and frontend-core projection now preserve
  `role` and `requestedLane`.
- Frontend inspector focus records now display role and requested lane.

## Validation

- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd --filter @kirakira/agent-runtime typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/event-store typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd --filter @kirakira/event-store build`
- `pnpm.cmd --filter @kirakira/agent-runtime build`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd exec vitest run test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/task-executor.test.ts test/unit/orchestrator-kernel/daemon-orchestrator.test.ts test/unit/event-store/subagent-projector.test.ts test/unit/frontend-core/projection.test.ts test/unit/frontend-core/inspector.test.ts test/unit/runtime-daemon/daemon-config.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts test/unit/agent-runtime/react-loop-delegate.test.ts`

## Remaining Work

- Compile topology role defaults for model, system preamble, max turns, and
  context mode as bounded defaults without widening task capability scope.
- Feed normalized topology roles into PEP context and audit writer paths.
- Add topology manifest/doctor checks so web, desktop, and runtime doctor can
  inspect active lanes, roles, and handoff edges without duplicating profile
  parsing.
- Add topology IDs and lineage parent fields to subagent lifecycle events.
