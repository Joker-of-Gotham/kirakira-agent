# Topology Manifest, Doctor, and Policy Context

Date: 2026-06-09
Branch: `codex/runtime-orchestration-profile-baseline`

## Why

The previous slice made subagent roles operational inside kernel routing and
events. The remaining gap was visibility and governance: topology still was not
discoverable through the public runtime manifest, runtime doctor could not
validate topology before daemon startup, and MCP PEP/audit paths did not receive
role/lane execution context.

Reference constraints used for this slice:

- OpenAI Agents SDK handoffs model delegation as explicit typed transfers with
  input filters and run context, so routing metadata should stay structured:
  https://openai.github.io/openai-agents-js/guides/handoffs/
- OpenAI Agents SDK guardrails distinguish workflow boundaries and tool-level
  checks, reinforcing that tool calls need their own policy context:
  https://openai.github.io/openai-agents-js/guides/guardrails/
- MCP lifecycle requires capability negotiation and initialized boundaries, so
  runtime topology belongs in a public sanitized manifest rather than hidden
  local config:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- OpenTelemetry GenAI agent span conventions keep agent and tool execution as
  structured telemetry facts, while system instructions are opt-in sensitive
  data:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/
- Open Policy Agent evaluates decisions from structured input, so topology role
  data belongs under execution context, not human principal roles:
  https://www.openpolicyagent.org/docs/policy-language

## What Changed

- Added a sanitized `RuntimeOrchestrationManifest` to runtime contracts and
  public daemon/browser-gateway manifests.
- Projected resolved runtime profile topology from daemon lifecycle health and
  manifest responses without exposing `system_preamble`, env values, tokens, or
  workspace paths.
- Added `orchestration:topology` readiness checks generated from runtime
  profiles and evaluated by runtime doctor as static topology contract checks.
- Extended runtime MCP call protocol with optional `subagentId`, `role`, and
  `requestedLane` metadata.
- Added structured `PepContext.agent` input and projected it into
  `PolicyInput.context.execution`.
- Extended audit actor/context schemas and ledger writer output so policy and
  tool execution rows preserve subagent role/lane metadata.
- Passed subagent role/lane context through both direct daemon MCP calls and
  delegated subagent ToolExecutor paths.

## Guardrails

- Topology role labels are never copied into `principal.roles`.
- Role `permissions` are exposed only as `permissionLabels` in the public
  manifest; they do not grant tool, skill, MCP, or runtime capabilities.
- Public manifests omit role `system_preamble` text and env values.
- Runtime doctor validates role/lane/handoff shape from profile data without
  hardcoding specific role names or presentation ports.

## Validation

- `pnpm.cmd --filter @kirakira/core typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/policy-engine typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/core build`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `pnpm.cmd exec vitest run test/unit/runtime-contracts/status.test.ts test/unit/runtime-contracts/runtime-protocol-codec.test.ts test/unit/runtime-daemon/daemon-lifecycle-health.test.ts test/unit/runtime-daemon/mcp-runtime.test.ts test/unit/core/schemas/policy.test.ts test/unit/core/schemas/audit.test.ts test/unit/policy-engine/pep.test.ts test/unit/runtime/runtime-doctor.test.ts test/unit/runtime/profile-resolution.test.ts`

## Remaining Work

- Add topology lineage IDs and handoff edge IDs to subagent lifecycle events.
- Route gateway trust/audit/OTel through the same execution context.
- Add frontend topology selectors/panel so web and desktop can show manifest
  roles/lanes as an execution map rather than an event log.
- Extend runtime doctor to validate role MCP server references against the MCP
  catalog once the catalog validator is shared.
