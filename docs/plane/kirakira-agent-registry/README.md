# Kirakira-Agent Registry Layer

## Overview

The Registry layer provides a unified package management abstraction for the Kirakira Agent CLI. It enables installing, verifying, and managing skills, MCP servers, plugins, and bundles from multiple sources.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐
│  CLI Commands│────▶│ registry-client│────▶│   Sources   │
│  (install,   │     │  (resolver,   │     │ registry:// │
│   search,    │     │   fetcher,    │     │ npm:        │
│   publish)   │     │   verifier,   │     │ github:     │
└─────────────┘     │   installer)  │     │ local:      │
                    └──────────────┘     │ oci://      │
                           │              └────────────┘
                           ▼
                    ┌──────────────┐
                    │  Blob Cache   │
                    │ ~/.kirakira/cache/ │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   kirakira.lock    │
                    └──────────────┘
```

## Packages

- **`@kirakira/registry-client`** — resolver, fetcher, verifier, installer, cache, API client
- **`@kirakira/core`** — shared types (`PackageMeta`, `TrustLevel`, `ResolvedSource`), Zod schemas, lockfile operations

## Sub-docs

| Doc | Description |
|-----|-------------|
| [01-package-types](./01-package-types/) | Package kinds: skill, mcp, plugin, bundle |
| [02-source-resolution](./02-source-resolution/) | Source type detection and URI parsing |
| [03-supply-chain-security](./03-supply-chain-security/) | Digest, signature, provenance verification |
| [04-cache-layout](./04-cache-layout/) | Content-addressable blob store layout |
| [05-api-reference](./05-api-reference/) | Enterprise Registry REST API |
| [06-lockfile-spec](./06-lockfile-spec/) | kirakira.lock format and integrity checks |
