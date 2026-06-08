# Runtime Profile Compose Contract

## Summary

`test-host` runtime profile services now match `docker-compose.test.yml`:

- Postgres uses `kirakira_test` credentials, database, and port `5432`
- Redis uses port `6379`
- Qdrant uses port `6333`
- Neo4j uses port `7687`
- MinIO uses port `9000`

A new contract test parses compose YAML and compares the profile service URLs
against the published service ports and Postgres test environment.

## Why

The profile had drifted to high host ports and production-style Postgres
credentials while the checked-in test compose file publishes the default service
ports with `kirakira_test` credentials. That made local test profile rendering a
different environment from the compose file it claimed to use.

## Verification

- `pnpm.cmd exec vitest run test/contract/runtime/runtime-profile-compose-contract.test.ts`
