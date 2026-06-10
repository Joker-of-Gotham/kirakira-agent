# kirakira.lock Specification

## Format

YAML file at workspace root (`kirakira.lock`).

```yaml
schemaVersion: 1
workspace: my-workspace
generatedAt: "2025-06-01T00:00:00.000Z"
packages:
  - kind: skill
    name: my-skill
    version: "1.0.0"
    source: "registry://my-skill@1.0.0"
    digest: "sha256:abc123..."
    trust: user-approved
    scope: workspace
    installedAt: "2025-06-01T00:00:00.000Z"
    provenance:
      buildType: ci
      builder: github-actions
      buildTimestamp: "2025-06-01T00:00:00Z"
```

## Fields

| Field | Required | Description |
|-------|----------|-------------|
| `kind` | Yes | skill \| mcp \| plugin \| bundle |
| `name` | Yes | Package name |
| `version` | Yes | Semver version |
| `source` | Yes | Original specifier |
| `digest` | Yes | sha256:... content hash |
| `trust` | Yes | Trust level at install time |
| `scope` | No | workspace \| user |
| `installedAt` | No | ISO 8601 timestamp |
| `provenance` | No | Build provenance info |

## Integrity Check

`validateLockIntegrity()` verifies every entry's digest against the local blob cache.

## Workspace Policy

The committed, reproducible lockfile is `kirakira.lock`. Local skill runtime
snapshots such as `skills-lock.json` are generated workspace state and should
stay untracked; promotion into the auditable install surface must go through the
`kirakira.lock` schema above.
