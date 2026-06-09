# EAM Parity Roadmap And Memory Env Defaults

Date: 2026-06-09

## Summary

Added a central four-track EAM parity roadmap and removed the memory integration
test helper's duplicate `test-host` endpoint defaults.

The roadmap keeps the active goal tied to the four requested tracks:

- EAM mechanism parity
- web and Electron presentation
- hardcoding, harness, SDK, and API cleanup
- Docker/local/runtime ecosystem unification

The memory helper now derives fallback service endpoints from the `test-host`
runtime profile through `scripts/runtime-profile.mjs`. Explicit `TEST_*`
overrides still win, caller-provided runtime env remains second, and profile
defaults are the only fallback.

## Design References

- MCP lifecycle and capability negotiation:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Docker Compose environment variables:
  https://docs.docker.com/compose/environment-variables/
  https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
- Electron context isolation and security:
  https://www.electronjs.org/docs/latest/tutorial/context-isolation
  https://www.electronjs.org/docs/latest/tutorial/security
- LangGraph multi-agent and handoff patterns:
  https://langchain-ai.github.io/langgraph/tutorials/multi_agent/multi-agent-collaboration/
  https://docs.langchain.com/oss/javascript/langchain/multi-agent/handoffs
- OpenAI Agents SDK handoffs and guardrails:
  https://openai.github.io/openai-agents-js/guides/handoffs/
  https://openai.github.io/openai-agents-js/guides/guardrails/
- OpenTelemetry GenAI agent spans:
  https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/

## Changed Files

- `docs/README.md`
- `docs/upgrade/eam-parity-roadmap.md`
- `test/helpers/memory-env.ts`

## Validation

Passed in this slice:

- `pnpm.cmd exec vitest run test/unit/runtime/memory-test-host-env.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts`
- `git diff --check`

## Boundary

This is not completion of the EAM parity goal. It is a control-plane and
ecosystem cleanup slice that makes the next implementation queue explicit and
removes one duplicated runtime dependency source.
