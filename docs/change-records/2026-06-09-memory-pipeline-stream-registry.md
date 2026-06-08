# Memory Pipeline Stream Registry

## Summary

Memory pipeline Redis stream configuration now uses `redis_stream_*` field names
instead of the accidental `redis_strkirakira_*` typo.

The worker dispatch path now routes through an explicit stream-to-handler
registry:

- `redis_stream_materialize` -> `_handle_materialize`
- `redis_stream_forget` -> `_handle_forget`
- `redis_stream_reflect` -> `_handle_reflect`

The legacy `KIRAKIRA_MEMORY_REDIS_STRKIRAKIRA_*` environment variable names are
still accepted as compatibility aliases so existing local environments do not
break during rollout.

## Why

The EAM memory pipeline uses stable `redis_stream_*` names. Kirakira's renamed
pipeline had drifted into a generated `strkirakira` typo, which made the config
API confusing and tied worker routing to misspelled field names.

## Verification

- `python -m compileall packages/memory-pipeline/src/kirakira_memory_pipeline test/unit/memory-pipeline`
- direct smoke import for config aliases and worker stream registry

`python -m pytest test/unit/memory-pipeline/test_config.py test/unit/memory-pipeline/test_worker.py`
could not run in the current interpreter because `pytest` is not installed.
