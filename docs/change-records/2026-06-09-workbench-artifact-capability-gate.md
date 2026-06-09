# Workbench Artifact Capability Gate

Date: 2026-06-09

## Summary

Connected the shared workbench to the runtime capability manifest for artifact
content previews.

The frontend now derives artifact preview support from the transport health
manifest:

- browser gateway health uses `RuntimeBrowserGatewayHealth.manifest`
- desktop IPC health uses `RuntimeDaemonHealth.details.manifest`
- mock transport remains enabled for local UI development

The workbench no longer fetches artifact content unless the runtime explicitly
reports the `artifacts` capability as `enabled` and advertises `get_artifact`.

## Design References

- MCP lifecycle capability negotiation, 2025-06-18:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- Electron security guidance for narrow renderer/main boundaries:
  https://www.electronjs.org/docs/latest/tutorial/security

## Changed Files

- `packages/frontend-core/src/runtime-capabilities.ts`
- `packages/frontend-core/src/index.ts`
- `packages/frontend-app/src/workbench.tsx`
- `test/unit/frontend-core/runtime-capabilities.test.ts`

## Boundaries

- This slice gates content preview requests; it does not hide artifact metadata.
- The renderer still cannot pass arbitrary file paths.
- Kirakira validation remains on web `5183`, desktop renderer `5174`, and
  runtime gateway `17373`.

## Validation

- `pnpm.cmd --filter @kirakira/frontend-core typecheck`
- `pnpm.cmd --filter @kirakira/frontend-core build`
- `pnpm.cmd --filter @kirakira/frontend-app typecheck`
- `pnpm.cmd exec vitest run test/unit/frontend-core/runtime-capabilities.test.ts test/unit/frontend-core/browser-gateway-health.test.ts`
- `pnpm.cmd --filter @kirakira/web build`
- `pnpm.cmd --filter @kirakira/desktop typecheck`
- `git diff --check`
