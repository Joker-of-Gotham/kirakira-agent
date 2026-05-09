# Registry HTTP API (client reference)

Base class: **`RegistryClient`** — `packages/cli/src/registry/client.ts`.

All methods prepend `baseUrl` (trailing slash stripped) and attach `Accept: application/json`. Optional `getAuthToken` adds `Authorization: Bearer`.

## `search(q, kind?)`

- **GET** `/v1/search?q=...&kind=...`
- Returns `SearchResult`.

## `getPackage(kind, name, version)`

- **GET** `/v1/packages/{kind}/{name}/{version}`
- Returns `PackageMeta`.

## `getBlob(digest)`

- **GET** `/v1/blobs/{digest}`
- Returns binary `ArrayBuffer`.

## `trust()`

- **GET** `/v1/trust`
- Returns `TrustEntry[]` for enterprise allowlists / publishers.

## `publish(meta, body)`

- **POST** `/v1/publish`
- Headers: `Content-Type: application/octet-stream`, `X-Kirakira-Package: JSON.stringify(meta)`
- Body: tarball or artifact bytes
- Response: `{ digest: string }`

## `resolve(req)`

- **POST** `/v1/resolve`
- JSON body: `ResolveRequest`
- Response: `ResolveResult`

## Error handling

Non-OK responses currently throw generic `Error` with textual status; callers may wrap in `RegistryError` (`packages/core/src/errors.ts`) for uniformity.
