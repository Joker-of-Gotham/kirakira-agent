# Graph Presentation Projection

## Summary

The shared web and desktop workbench now projects daemon execution graphs as a
first-class presentation model.

This slice adds:

- graph topology state to `@kirakira/frontend-core`
- task delta and checkpoint projection into the graph model
- a shared execution graph panel in `@kirakira/frontend-app`
- richer mock runtime graph events for web and desktop development

## Why

Daemon submissions now execute through the orchestrator graph loop, but the
browser and Electron surfaces previously only showed `graph.normalized` as a
generic timeline event. That made the new graph execution path hard to inspect
from the presentation layer.

## References

- React official hook docs for external subscriptions and effect cleanup:
  https://react.dev/reference/react/useSyncExternalStore and
  https://react.dev/reference/react/useEffect
- W3C WAI-ARIA Authoring Practices for accessible dynamic UI semantics:
  https://www.w3.org/WAI/ARIA/apg/
- Electron security and IPC guidance for keeping daemon access in the main
  process boundary:
  https://www.electronjs.org/docs/latest/tutorial/security
- OpenHuman reference patterns inspected locally:
  `reference_project/openhuman/app/src/pages/conversations/components/ToolTimelineBlock.tsx`,
  `reference_project/openhuman/app/src/pages/conversations/components/SubagentDrawer.tsx`,
  and
  `reference_project/openhuman/app/src/pages/conversations/components/TaskKanbanBoard.tsx`.

## Verification

- `pnpm.cmd exec vitest run test/unit/frontend-core/projection.test.ts`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/frontend-app build`
- `pnpm.cmd --filter @kirakira/web typecheck`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `pnpm.cmd exec vitest run test/unit/frontend-core/projection.test.ts test/unit/web/runtime-config.test.ts test/unit/desktop/runtime-ipc.test.ts`
- `Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5183`

The in-app Browser connection could not be completed in this Windows session
because the browser control kernel exited with `windows sandbox failed: spawn setup refresh`.
The dev server was still verified over HTTP on the Kirakira web port `5183`;
port `5173` was not used.
