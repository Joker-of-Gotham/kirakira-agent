# Daemon Durable Checkpoints

## Summary

Daemon graph execution now has a real durable checkpoint path instead of a
no-op checkpoint repository.

This slice adds:

- async checkpoint saves at superstep boundaries in `KernelLoop`
- configurable daemon checkpoint durability
- FS-backed graph checkpoint storage under the event-store root
- daemon resume projection from a saved checkpoint
- tests for superstep checkpoint saves and checkpoint restore events

## Why

The daemon now runs submitted prompts through the graph kernel, but checkpoint
durability was incomplete: the loop always passed `superstepBoundary: false`,
and the runtime daemon did not inject a persistent checkpoint repository. This
made graph execution inspectable but not recoverable.

The implementation follows the same broad durable-execution shape used by
graph runtimes such as LangGraph: graph state is persisted at superstep
boundaries, and resume/inspection can restore a prior graph snapshot without
re-running already persisted nodes.

## References

- LangGraph persistence documentation:
  https://docs.langchain.com/oss/python/langgraph/persistence
- Temporal durable execution documentation:
  https://docs.temporal.io/
- OpenAI Agents SDK tracing documentation:
  https://openai.github.io/openai-agents-python/tracing/

## Verification

- `pnpm.cmd exec vitest run test/unit/orchestrator-kernel/task-executor.test.ts test/unit/orchestrator-kernel/daemon-orchestrator.test.ts`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel typecheck`
- `pnpm.cmd --filter @kirakira/orchestrator-kernel build`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd --filter @kirakira/runtime-daemon build`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
