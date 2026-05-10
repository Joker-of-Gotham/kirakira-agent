# Documentation Hub

This directory is the working documentation surface for `kirakira-agent`.

The docs are split into three layers:

1. **entry docs**: the files you should read first
2. **plane docs**: deeper subsystem notes grouped by responsibility
3. **change records**: implementation history for concrete fixes and upgrades

## Start Here

- [Top-level README](../README.md) - product-facing overview, screenshots, startup path
- [Architecture](./architecture.md) - current runtime shape and subsystem boundaries
- [Change records](./change-records/README.md) - implementation history and verification notes

## Core Planes

- [CLI](./plane/kirakira-agent-cli/README.md)
- [Config](./plane/kirakira-agent-config/README.md)
- [Gateway](./plane/kirakira-agent-gateway/README.md)
- [Memory](./plane/kirakira-agent-memory/README.md)
- [Orchestration](./plane/kirakira-agent-orchestration.md)
- [Policy](./plane/kirakira-agent-policy/README.md)
- [Registry](./plane/kirakira-agent-registry/README.md)
- [Tracing](./plane/kirakira-agent-tracing/README.md)

## Reading Order

If you are new to the repo:

1. read the [README](../README.md)
2. read the [architecture overview](./architecture.md)
3. read the [CLI plane](./plane/kirakira-agent-cli/README.md)
4. drop into a narrower plane only when you are changing that subsystem

If you are debugging recent behavior:

1. open [change records](./change-records/README.md)
2. start from the newest entry
3. verify the listed commands before changing code again

## Scope

These docs are meant to track the implementation that is actually in this repository. When the code changes, the entry docs and change records should move with it.

