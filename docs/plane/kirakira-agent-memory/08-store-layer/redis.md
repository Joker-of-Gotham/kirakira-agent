# Redis — hot path

Redis provides **streams**, **locks**, **cache**, and **rate limiting** for the memory plane. Data in Redis is **ephemeral or derived**; Postgres and object storage remain authoritative.

Implementation touchpoints:

- **Client factory:** `packages/memory-store/src/redis/client.ts` (`ioredis`)
- **Canonical names:** `packages/memory-core/src/constants.ts` (`REDIS_KEY_PREFIX`, `REDIS_STREAMS`)
- **Default outbox routes:** `packages/memory-store/src/outbox/dispatcher.ts` (stream names may differ—align in deployment)

---

## Key schema overview

Prefixes (from `REDIS_KEY_PREFIX` in `memory-core`):

| Prefix constant | Value | Typical use |
|-----------------|-------|-------------|
| `lock` | `kirakira:lock:` | Distributed locks / leases |
| `stream` | `kirakira:stream:` | Namespace for stream keys when composed |
| `cache` | `kirakira:cache:` | Recall, entity resolution, rerank caches |
| `hot` | `kirakira:hot:` | Small hot structures (e.g. latest checkpoint ref) |

Legacy / doc examples in design notes sometimes omit the `kirakira:` prefix (e.g. `lock:run:…`). **Pick one convention per environment** and map the outbox dispatcher to the same stream strings consumers use.

---

## Streams

Streams carry **append-only** work items for async materializers. Prefer **consumer groups** so multiple workers share load and get at-least-once delivery with `XREADGROUP` / `XACK`.

### Logical streams

| Stream (concept) | Canonical key (`REDIS_STREAMS`) | Default outbox `event_type` → stream (`dispatcher.ts`) |
|------------------|---------------------------------|----------------------------------------------------------|
| Materialize | `kirakira:stream:memory:materialize` | `memory.retained` → `stream:memory:materialize` |
| Forget | `kirakira:stream:memory:forget` | `memory.forget` → `stream:memory:forget` |
| Artifact index | `kirakira:stream:artifact:index` | Extend dispatcher with e.g. `artifact.indexed` |
| Reflect | `kirakira:stream:memory:reflect` | Extend dispatcher with e.g. `memory.reflect` |

Register additional routes when wiring `createDefaultDispatcher(extraRoutes)`.

### Outbox message shape (`XADD` fields)

The outbox processor publishes:

- `id` — outbox bigint id (string)
- `event_type`
- `tenant_id`
- `aggregate_id`
- `payload` — JSON string

Workers should parse `payload` idempotently (same outbox id may be re-delivered on partial failures until ack policies are tightened).

### Example stream keys

```text
kirakira:stream:memory:materialize
kirakira:stream:memory:forget
kirakira:stream:artifact:index
kirakira:stream:memory:reflect
```

Shorter alias style (if used):

```text
stream:memory:materialize
stream:memory:forget
stream:artifact:index
```

---

## Lock manager

Distributed locks prevent overlapping **run** or **checkpoint** operations across processes. Use **short TTLs**, **unique tokens**, and **compare-and-delete** on unlock to avoid deleting another owner’s lock.

### Key patterns

```text
kirakira:lock:run:{run_id}
kirakira:lock:checkpoint:{run_id}:{step_no}
```

Legacy examples:

```text
lock:run:{run_id}
lock:checkpoint:{run_id}:{step_no}
```

Values can be random tokens; TTL via `PX` (milliseconds).

### Lua: atomic acquire

Only set if absent; return whether this client won the lock.

```lua
-- KEYS[1] = lock key
-- ARGV[1] = token
-- ARGV[2] = ttl ms
if redis.call('GET', KEYS[1]) == false then
  redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
  return 1
end
return 0
```

### Lua: safe release

Delete only if the value still matches the token.

```lua
-- KEYS[1] = lock key
-- ARGV[1] = token
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
```

For **extend/renew**, use a Lua script that checks the token and bumps TTL atomically.

---

## Cache manager

Caches reduce repeat recall cost and stabilize entity resolution. Key patterns:

```text
kirakira:cache:recall:{tenant_id}:{query_hash}
kirakira:cache:entity:{tenant_id}:{canonical_entity_key}
```

Legacy style:

```text
cache:recall:{tenant}:{hash}
cache:entity:{tenant}:{canon_name}
```

Set **TTLs** per policy (shorter for high-churn tenants). Include **schema version** or model id in the hash input when recall ranking changes.

### `getOrSet` pattern

```typescript
async function getOrSet<T>(
  redis: Redis,
  key: string,
  ttlSec: number,
  factory: () => Promise<T>,
  serialize: (v: T) => string,
  deserialize: (s: string) => T,
): Promise<T> {
  const hit = await redis.get(key);
  if (hit !== null && hit !== undefined) {
    return deserialize(hit);
  }
  const value = await factory();
  await redis.set(key, serialize(value), "EX", ttlSec);
  return value;
}
```

Use **nonce** or **lock key** around `factory()` if stampede protection is required under high concurrency.

---

## Consumer groups: `ConsumerWorker` lifecycle

Typical lifecycle for a stream consumer (pseudocode aligned with `ioredis`):

1. **Create group** — `XGROUP CREATE stream group $ MKSTREAM` (ignore BUSYGROUP on restarts).
2. **Claim work** — `XREADGROUP GROUP group consumer BLOCK … STREAMS stream >`.
3. **Process** — Parse fields; call idempotent handlers (vector upsert, graph merge, cache invalidation).
4. **Ack** — `XACK stream group messageId` after durable side effects succeed.
5. **Recover pending** — Periodically `XAUTOCLAIM` or `XPENDING` + `XCLAIM` for stuck messages past a threshold.
6. **Shutdown** — Stop reading; leave pending entries for another member of the same group.

Recommended practices:

- Use **one consumer name per process** (`hostname:pid` or pod name).
- Bound **batch size** and total **processing time**; extend visibility with claim timeouts for long jobs.
- Publish **metrics**: lag, pending count, age of oldest pending, per-handler errors.

---

## Rate limiting

Use **token bucket** or **sliding window** keys, for example:

```text
kirakira:hot:ratelimit:embed:{tenant_id}
kirakira:hot:ratelimit:llm:{provider}
```

Implement with Lua for atomicity or use Redis 8+ / modules if available.

---

## Related reading

- [`outbox.md`](outbox.md) — how events land in streams
- [`README.md`](README.md) — store layer overview
