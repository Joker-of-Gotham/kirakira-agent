# Source Resolution

## Specifier Formats

The resolver accepts the following specifier formats:

| Format | Source Type | Example |
|--------|------------|---------|
| `registry://name@ver` | Enterprise registry | `registry://my-skill@1.0.0` |
| `npm:name@ver` | npm registry | `npm:@org/tool@2.3.4` |
| `github:owner/repo@ref` | Git clone | `github:org/skill@main` |
| `local:/path` | Local filesystem | `local:./skills/my-skill` |
| `oci://host/repo@tag` | OCI artifact | `oci://ghcr.io/org/skill@latest` |
| `name@ver` | Default (registry) | `my-tool@1.0.0` |

## Resolution Algorithm

```
Input specifier
  ├─ Starts with known prefix? → matched source type
  ├─ Starts with / or ./ or ../? → local
  └─ Otherwise → default type (registry)
```

## ResolvedSource Type

```typescript
interface ResolvedSource {
  type: SourceType;  // "registry" | "npm" | "github" | "local" | "oci"
  uri: string;       // package name or path
  ref?: string;      // version, branch, tag
  subpath?: string;  // sub-directory within package
}
```
