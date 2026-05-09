# Cache Layout

## Directory Structure

```
~/.kirakira/
├── cache/
│   ├── blobs/sha256/       # Content-addressable blob store
│   │   ├── abc123def...    # Blob keyed by sha256 hash
│   │   └── ...
│   ├── manifests/          # JSON metadata cache
│   │   ├── my-skill.json
│   │   └── ...
│   └── tmp/                # Temporary download staging
│       ├── git-<ts>/
│       ├── npm-<ts>/
│       └── oci-<ts>/
├── installed/              # Symlinks to cached blobs
│   ├── skill/
│   ├── mcp/
│   └── plugin/
└── registry/
    ├── auth.json           # Registry authentication
    └── trust.json          # Publisher trust entries
```

## Cache Operations

| Operation | Method |
|-----------|--------|
| Check existence | `cache.hasBlob(digest)` |
| Read blob | `cache.readBlob(digest)` |
| Write blob | `cache.writeBlob(digest, data)` |
| Remove blob | `cache.removeBlob(digest)` |
| Get stats | `cache.stats()` |
| Prune old entries | `cache.prune(maxBytes)` |

## Pruning

LRU eviction by modification time. `prune(maxBytes)` removes oldest blobs until total size fits within the limit.
