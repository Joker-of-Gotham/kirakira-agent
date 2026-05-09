# Registry REST API Reference

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/search?q=&kind=&page=&per_page=` | Search packages |
| GET | `/v1/packages/:kind/:name/:version` | Get package metadata |
| GET | `/v1/blobs/:digest` | Download blob |
| POST | `/v1/publish` | Publish a package |
| POST | `/v1/resolve` | Resolve dependencies |
| POST | `/v1/yank` | Mark version as yanked |
| GET | `/v1/trust/publishers` | List trusted publishers |

## Authentication

All endpoints accept `Authorization: Bearer <token>` header. Tokens are obtained via `kirakira-agent registry login`.

## Response Format

```json
{
  "kind": "skill",
  "name": "my-skill",
  "version": "1.0.0",
  "publisher": "org",
  "digest": "sha256:...",
  "trustLevel": "internal-signed",
  "publishedAt": "2025-01-01T00:00:00Z"
}
```
