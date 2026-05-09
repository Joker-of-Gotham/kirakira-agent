# Local registry cache (`~/.kirakira/cache/`)

Helpers in **`packages/cli/src/registry/cache.ts`** map logical digests to filesystem paths rooted at **`getUserHome()`** + `PATHS` segments from `packages/core/src/constants.ts`.

## Layout (constants)

| Constant | Relative path | Purpose |
|----------|-----------------|---------|
| `userCache` | `cache` | Root |
| `userCacheBlobs` | `cache/blobs/sha256` | Content-addressed blobs (`blobPath`) |
| `userCacheManifests` | `cache/manifests` | Metadata JSON per name@version (`manifestPath`) |
| `userCacheIndex` | `cache/index.sqlite` | Future local index (reserved) |

## Key functions

- **`cacheRoot()`** — `getUserCacheDir()` alias.
- **`blobPath(digest)`** — Shards by first two hex chars to avoid huge directories.
- **`writeBlob` / `readBlobIfExists`** — Atomic-ish read/write helpers.
- **`ensureCacheDirs`** — Creates subtree before writes.

## Hygiene

CLI maintenance commands may prune orphaned blobs; keep digests referenced by manifests before deletion.

## Auth separation

Registry credentials live under `PATHS.userRegistryAuth`; cache does **not** store secrets—only package bytes and derivation metadata.
