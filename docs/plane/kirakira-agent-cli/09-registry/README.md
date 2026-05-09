# Registry system

The registry is an HTTP API consumed by **`RegistryClient`** in `packages/cli/src/registry/client.ts`, with local blob caching in `packages/cli/src/registry/cache.ts` and auth helpers in `auth.ts`.

## Types

All request/response shapes come from `@kirakira/core` (`packages/core/src/types/registry.ts`): `SearchResult`, `PackageMeta`, `ResolveRequest`, `ResolveResult`, `TrustEntry`.

## CLI commands

`packages/cli/src/commands/registry/` implements login, whoami, search, publish, yank—each wraps `RegistryClient` after obtaining credentials.

## Local storage paths

`PATHS.userRegistryAuth`, `userRegistryTrust`, and cache subtrees (`userCacheBlobs`, `userCacheManifests`, `userCacheIndex`) are defined in `packages/core/src/constants.ts` and accessed via `getUserCacheDir` / `blobPath` (`cache.ts`).

## Related docs

- [API reference](./api.md)
- [Distribution](./distribution.md)
- [Cache layout](./cache.md)
