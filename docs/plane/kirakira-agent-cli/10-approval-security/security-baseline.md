# Security baseline

## Path safety

- Use **`isPathWithin`** (`packages/core/src/utils/paths.ts`) before reading user-supplied relative paths.
- Throw **`PathTraversalError`** (`packages/core/src/errors.ts`) when escaping workspace roots.

## Injection surfaces

- Shell passthrough (`parser/shell.ts`) must never interpolate unchecked mention text into commands.
- MCP tool arguments should be validated server-side; CLI applies `tool-filter.ts` (`packages/mcp-adapter/src/tool-filter.ts`) for allow/deny lists.

## Redaction

- `policy.yaml` `privacy.redactEnv` lists env vars stripped in exports.
- Audit entries support hashed fields (`inputHash`, `outputHash`) in `AuditEntry` (`packages/core/src/types/trace.ts`).

## MCP safety

- Remote HTTP gated by `policy.mcp.allowRemoteHttp`.
- Legacy SSE gated by `allowLegacySse` (`schemas/config.ts`).
- OAuth scopes recorded on descriptors for approval UX (`evaluator.ts`).

## Compatibility imports

`security-scanner.ts` (`packages/compat/src/security-scanner.ts`) flags suspicious patterns during `pipeline.ts` imports.

## Dependency hygiene

Run `pnpm audit` / corporate scanners on release branches; Python gateway should pin provider SDK versions in its packaging metadata.
