# Memory Pipeline Runtime Env Bridge

Date: 2026-06-09

## Context

The runtime profile catalog emits canonical service endpoints such as `DATABASE_URL`,
`REDIS_URL`, `QDRANT_URL`, `NEO4J_URI`, and `S3_ENDPOINT`. The Python memory
pipeline still read only `KIRAKIRA_MEMORY_*` settings and defaulted to localhost,
while the TypeScript memory test helper kept a second set of hardcoded host
defaults.

## References

- Python `urllib.parse.urlsplit` is the standard URL component parser used to
  derive Qdrant host and port from `QDRANT_URL`.
- Qdrant Python client documents `AsyncQdrantClient(url=...)`, so the vector
  materializer can use the full runtime URL instead of reducing every endpoint
  to host and port.
- Twelve-Factor configuration guidance keeps deploy-specific service endpoints
  in environment variables.
- Docker Compose environment precedence keeps explicit test/runtime overrides
  ahead of image or default values, matching the helper precedence used here.

## Changes

- `MemoryPipelineConfig` now accepts runtime profile env aliases for Postgres,
  Redis, Qdrant, Neo4j, and S3/MinIO while preserving narrower
  `KIRAKIRA_MEMORY_*` overrides.
- `QDRANT_URL` is parsed into `qdrant_host` and `qdrant_port` when those fields
  are not explicitly set.
- `VectorMaterializer` now passes a full `qdrant_url` to `AsyncQdrantClient`
  when one is configured.
- `test/helpers/memory-env.ts` now prefers explicit `TEST_*` values, then
  runtime profile env values, then `test-host` fallback endpoints.
- Python and TypeScript tests cover runtime aliases, override precedence, and
  profile port overrides.

## Validation

- `pnpm.cmd vitest run test/unit/runtime/memory-test-host-env.test.ts`
- `python` direct config assertion script using `packages/memory-pipeline/src/kirakira_memory_pipeline/config.py`
- `python -m compileall packages/memory-pipeline/src/kirakira_memory_pipeline test/unit/memory-pipeline/test_config.py`
- `pnpm.cmd vitest run test/unit/runtime/memory-test-host-env.test.ts test/contract/runtime/runtime-profile-compose-contract.test.ts test/unit/runtime/profile-resolution.test.ts`
- `pnpm.cmd typecheck`
- `pnpm.cmd test`
- `git diff --check`

`python -m pytest test/unit/memory-pipeline/test_config.py` could not be run in
the current shell because the `python` interpreter has `pydantic-settings` but no
`pytest`, while the `py` interpreter has `pytest` but lacks `pydantic-settings`.
