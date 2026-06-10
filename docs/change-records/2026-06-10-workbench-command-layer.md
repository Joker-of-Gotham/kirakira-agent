# Workbench Command Layer

Date: 2026-06-10

## Scope

- Added a shared command action projection for Web and Electron workbench surfaces.
- Added a topbar command trigger and modal command palette in `packages/frontend-app`.
- Command actions now derive from run state, workbench navigation, attention items, approval gates, active artifacts, and selected MCP tools.
- Presentation render evidence now requires the shared command entry point on both Web and Desktop SSR surfaces.

## Design Notes

- The command layer follows the existing Kirakira token system and dense workbench layout.
- The modal uses `role="dialog"` and `aria-modal="true"` with Escape close, focus return, and Tab focus containment.
- Complex command rows are rendered as buttons, not ARIA listbox options, because command rows contain interactive affordances.
- The pure action model lives outside React so Electron menu hooks, palette UI, and future runtime gateway controls can share the same projection.

## References

- WAI-ARIA Authoring Practices Guide, Dialog Modal Pattern.
- WAI-ARIA Authoring Practices Guide, Listbox Pattern.
- MDN `KeyboardEvent.key`.
- React `useMemo` reference.
- `reference_project/openhuman/app/src/components/commands/CommandProvider.tsx`
- `reference_project/openhuman/app/src/components/commands/CommandPalette.tsx`

## Validation

- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd --filter @kirakira/web typecheck`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd exec vitest run test/unit/frontend-app/command-actions.test.ts test/unit/frontend-app/presentation-render-evidence.test.ts`
- `pnpm.cmd presentation:render -- --profile workbench-host`
- `node scripts/upgrade-readiness.mjs --profile workbench-host --format json`
- `node scripts/eam-parity-audit.mjs --depth files`

## Current Gate State

- `upgrade-readiness`: 24 pass, 1 warn, 0 fail. The remaining warn is the Docker daemon preflight for the full lifecycle gate.
- `presentation-render-evidence`: passed for Web and Desktop; targets remain `http://127.0.0.1:5183/` and `http://127.0.0.1:5174/`; forbidden port `5173` remains absent.
- Headless Chrome and Edge screenshot attempts were blocked by local GPU initialization failures before screenshot capture. The foreground Vite startup still confirmed this project serves Web at `http://127.0.0.1:5183/`.
