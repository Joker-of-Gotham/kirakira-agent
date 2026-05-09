# Mirror Failover

## Mechanism

`MirrorSelector` maintains a list of base URLs and rotates to the next mirror after `switch_on_error_count` consecutive transient errors.

## Configuration

```toml
# agent.toml or environment
LLM_BASE_URL = "http://primary/v1"
LLM_MIRROR_BASE_URLS = "http://mirror1/v1,http://mirror2/v1"
```

## Behavior

1. Requests go to the current active mirror
2. On success → `record_success()` resets error counter
3. On transient error → `record_transient_failure()` increments counter
4. After N failures → switch to next mirror in round-robin
5. Cooldown period prevents rapid switching

## Transient Error Detection

`is_transient_error()` checks for:
- Connection timeouts
- HTTP 429 / 502 / 503 / 504
- Network-level exceptions
