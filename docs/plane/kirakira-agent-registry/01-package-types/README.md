# Package Types

## Kinds

| Kind | Description | Entry File |
|------|-------------|------------|
| `skill` | Agent skill with SKILL.md | `SKILL.md` |
| `mcp` | MCP server definition | `.mcp.json` / manifest |
| `plugin` | CLI plugin (oclif) | `package.json` |
| `bundle` | Multi-package collection | `bundle.json` |

## Type Definitions

```typescript
type PackageKind = "skill" | "mcp" | "plugin" | "bundle";

interface PackageMeta {
  kind: PackageKind;
  name: string;
  version: string;
  publisher: string;
  digest: string;          // sha256:...
  trustLevel: TrustLevel;
  provenance?: ProvenanceInfo;
}
```

## Trust Levels

| Level | Meaning |
|-------|---------|
| `internal-signed` | Signed by organization CA |
| `enterprise-allow` | Approved by enterprise policy |
| `user-approved` | User explicitly accepted |
| `untrusted` | No verification performed |
