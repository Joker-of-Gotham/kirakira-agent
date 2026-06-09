# Runtime Artifact Content Policy

Date: 2026-06-09

## Summary

Moved artifact preview policy from daemon-local helpers into
`@kirakira/runtime-contracts`.

The shared contract now owns:

- preview byte limit resolution
- text artifact kind names
- text artifact file extensions
- `Uint8Array`-based text/binary detection
- public preview encoding selection

The daemon remains responsible for filesystem access, canonical path checks, and
bounded file reads, but it no longer owns a second copy of the artifact content
policy.

## Design References

- MCP lifecycle capability negotiation, 2025-06-18:
  https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- OWASP path traversal guidance:
  https://owasp.org/www-community/attacks/Path_Traversal
- Node.js Buffer documentation, which documents Buffer as compatible with
  `Uint8Array` inputs:
  https://nodejs.org/api/buffer.html

## Changed Files

- `packages/runtime-contracts/src/artifact-content.ts`
- `packages/runtime-contracts/src/index.ts`
- `packages/runtime-daemon/src/server/artifact-content.ts`
- `test/unit/runtime-contracts/artifact-content.test.ts`
- `test/unit/runtime-daemon/artifact-content.test.ts`

## Boundaries

- Shared runtime contracts stay browser-safe and do not import Node `path`,
  `Buffer`, or filesystem modules.
- Path canonicalization and workspace containment remain daemon responsibilities.
- The renderer still requests artifact previews by `runId` and `artifactId`, not
  arbitrary host paths.

## Validation

- `pnpm.cmd --filter @kirakira/runtime-contracts typecheck`
- `pnpm.cmd --filter @kirakira/runtime-contracts build`
- `git diff --check`
- `pnpm.cmd --filter @kirakira/runtime-daemon typecheck`
- `pnpm.cmd exec vitest run test/unit/runtime-contracts/artifact-content.test.ts test/unit/runtime-daemon/artifact-content.test.ts test/unit/runtime-contracts/runtime-protocol-codec.test.ts`
