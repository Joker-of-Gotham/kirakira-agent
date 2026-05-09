# CI matrix (recommended)

A `.github/workflows/ci.yml` should be configured to align with **pnpm**, **Turbo**, and **Vitest** as defined in the root `package.json`.

## Platform matrix

| OS | Purpose |
|----|---------|
| Linux (Ubuntu) | Primary server CI |
| macOS | Filesystem case quirks, Keychain-adjacent auth |
| Windows / WSL | Path separators, stdio MCP |

## Stages

1. **Install** — `pnpm install --frozen-lockfile`
2. **Lint** — `pnpm lint`
3. **Typecheck** — `pnpm typecheck`
4. **Build** — `pnpm build`
5. **Test** — `pnpm test` (unit + integration projects)
6. **Artifact signing** — Sign `kirakira-agent` binaries + SBOM (Cosign / Sigstore or org standard)

## Supply chain

- Generate **SBOM** (`cyclonedx` / `syft`) for npm packages and Python `model-gateway` wheel
- Upload attestations alongside registry releases (`09-registry/distribution.md`)

## Caching

Enable Turbo remote cache or GitHub Actions cache keyed on `pnpm-lock.yaml` + `turbo.json`.

## Local parity

Developers on WSL should run the same scripts to reproduce CI failures (`pnpm test:unit`).
