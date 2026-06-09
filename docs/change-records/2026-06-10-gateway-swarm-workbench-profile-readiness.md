# Gateway, Swarm, Workbench, And Profile Readiness

Date: 2026-06-10
Branch: `codex/runtime-orchestration-profile-baseline`

## Scope

This slice advances all four upgrade tracks without changing the Kirakira
runtime endpoints. Web remains profile-owned at `http://127.0.0.1:5183/`,
desktop renderer at `http://127.0.0.1:5174/`, and browser gateway at
`ws://127.0.0.1:17373/runtime`.

## Changes

- Added a typed CLI runtime script registry so profile/doctor command bridges no
  longer carry raw script-name literals.
- Added MCP OTel recorder profile planning in `@kirakira/mcp-adapter`, including
  env/profile-selected modes for disabled, in-memory, and OpenTelemetry API
  recorder construction.
- Routed delegated daemon `ToolExecutor` MCP calls through a daemon-owned
  `AgentMcpToolGateway` so delegated and direct MCP calls share the same runtime
  call path, policy, audit, trace, structured content, and tool-originated
  `isError` semantics.
- Added orchestrator topology metadata for deterministic subagent lineage IDs,
  handoff edge IDs, role defaults, permission labels, and approval-derived
  scheduling edges.
- Reused the selected runtime readiness compose plan for workbench infra startup
  and exposed a filtered smoke readiness plan from the smoke CLI.
- Added a tested shared workbench navigation projection and active Runs, Agents,
  Research, and Systems workspace surfaces for both web and Electron renderer.
- Added `DESIGN.md` for Kirakira workbench tokens, IA, layout rules, component
  expectations, motion, and accessibility constraints.

## References

- MCP `CallToolResult` schema and tool-originated `isError` semantics:
  https://modelcontextprotocol.io/specification/2025-11-25/schema
- OpenTelemetry MCP semantic conventions:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/
- OpenAI Agents SDK handoff model:
  https://openai.github.io/openai-agents-js/guides/handoffs/
- Docker Compose startup order and health waits:
  https://docs.docker.com/compose/how-tos/startup-order/
- Electron security model:
  https://www.electronjs.org/docs/latest/tutorial/security

## Validation

- `pnpm.cmd exec vitest run test/unit/cli/runtime-script-command.test.ts test/unit/cli/runtime-doctor-command.test.ts test/unit/cli/runtime-profile-command.test.ts`
- `pnpm.cmd --filter @kirakira/cli typecheck`
- `pnpm.cmd exec vitest run test/unit/mcp-adapter/otel-bridge.test.ts test/unit/mcp-adapter/otel-profile.test.ts test/unit/mcp-adapter/gateway-context.test.ts`
- `pnpm.cmd --filter @kirakira/mcp-adapter typecheck`
- `pnpm.cmd exec vitest run test/unit/orchestrator-kernel/subagent-contract.test.ts test/unit/orchestrator-kernel/task-executor.test.ts test/unit/orchestrator-kernel/daemon-orchestrator.test.ts`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd exec vitest run test/unit/runtime-daemon/agent-mcp-tool-gateway.test.ts test/unit/runtime-daemon/mcp-runtime.test.ts test/unit/runtime-daemon/kernel-bridge-subagent.test.ts`
- `pnpm.cmd turbo typecheck --filter=@kirakira/runtime-daemon`
- `pnpm.cmd exec vitest run test/unit/runtime/startup-contract.test.ts test/unit/scripts/workbench-launcher.test.ts test/unit/scripts/workbench-smoke.test.ts test/contract/runtime/workbench-smoke-gate.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts test/unit/runtime/profile-resolution.test.ts`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app build`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd --filter @kirakira/desktop build`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface web --timeout-ms 120000 --dry-run`
- `pnpm.cmd e2e:workbench -- --profile workbench-host --surface desktop --timeout-ms 120000 --dry-run`
- In-app browser check against `http://127.0.0.1:5183/`: HTTP 200, title
  `Kirakira Agent`, Runs/Agents/Research/Systems navigation visible and
  switchable, no browser console errors.

## Remaining Risks

- Live Docker/local web and Electron smoke gates still need a slower execution
  window.
- The profile-selected MCP OTel recorder is planned and constructible, but it
  still needs daemon transport injection and real OTLP exporter configuration.
- Lineage, topology, and permission metadata currently travel through delegate
  action args and worker `extra`; `@kirakira/agent-runtime` should promote them
  into first-class delegate request fields.
- Memory retain/reflect event wiring and live checkpoint persistence remain open.
