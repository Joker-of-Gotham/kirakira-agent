# Run inspector workbench slice

Date: 2026-06-09

## Scope

- Added a browser-safe run inspector projection in `@kirakira/frontend-core`.
- Rendered the projection in the shared React workbench used by both web and Electron renderer surfaces.
- Preserved the existing runtime transport, event projection, and three-column workbench structure.
- Left unrelated workspace-local changes untouched.

## Source Basis

- React state placement guidance: keep selected inspector focus as local UI state and derive the rest from the shared projection.
  <https://react.dev/learn/preserving-and-resetting-state>
- WAI-ARIA button guidance: inspector record selectors use stable button labels with `aria-pressed`.
  <https://www.w3.org/WAI/ARIA/apg/patterns/button/>
- MDN live-region guidance: the runtime timeline uses `role="log"` with redundant polite live behavior, and UI status uses `role="status"`.
  <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role>
  <https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Live_Regions>
- OpenHuman reference patterns: dense operational panels, explicit loading/error/empty states, and pure presentation components for timeline-style summaries.
  `reference_project/openhuman/app/src/components/settings/panels/EventLogPanel.tsx`
  `reference_project/openhuman/app/src/components/intelligence/MemoryTimelinePanel.tsx`

## Design Decisions

- The inspector is a projection, not React-only state. This keeps web and desktop surfaces aligned.
- The UI consumes semantic lanes and focus records rather than branching on runtime event kinds in JSX.
- The timeline renders in chronological order for live-region semantics while the projection keeps its latest-first contract.
- Styling uses existing `--kk-*` tokens, the current 8px radius scale, and responsive grid collapse rules.

## Verification

- `pnpm.cmd exec vitest run test/unit/frontend-core/inspector.test.ts test/unit/frontend-core/projection.test.ts test/unit/frontend-core/browser-boundary.test.ts`
- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`

## Browser Note

The web preview was started on the project port `http://127.0.0.1:5183`.
Headless Playwright inspection could not complete because neither the project nor the available Codex runtime bundle exposed a complete Playwright installation in this sandbox.
