# Registry distribution strategy

## npm / workspace packages

TypeScript packages (`@kirakira/core`, `@kirakira/cli`, etc.) publish via the org’s npm scope—`pnpm publish` from each package after `pnpm build` (see root `package.json` scripts and `turbo.json` outputs).

## CLI binary

`packages/cli/package.json` declares the `kirakira-agent` bin pointing to `bin/run.js` post-build. Consumers install globally or use `pnpm dlx` / internal package registry mirrors.

## Immutable artifacts

`RegistryClient.publish` uploads opaque bytes; digests returned align with **`writeBlob` / `blobPath`** caching (`packages/cli/src/registry/cache.ts`) keyed by content hash.

## Install scripts

Enterprise deployments may ship:

- Signed tarball + checksum manifest
- Internal PyPI mirror for **`packages/model-gateway`** (Python distribution layout under `src/kirakira_model_gateway/`)

SBOM and signing are covered in [CI matrix](../15-testing/ci-matrix.md).

## Self-update

`kirakira-agent self-update` (`packages/cli/src/commands/self-update.ts`) provides a built-in upgrade path once wired to release endpoints.
