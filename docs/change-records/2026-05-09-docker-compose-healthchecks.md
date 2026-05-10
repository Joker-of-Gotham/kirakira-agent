# 2026-05-09 Docker Compose Healthcheck Repair

## Symptom

`docker compose run --rm kirakira-agent` failed before entering the interactive page:

```text
dependency failed to start: container kirakira-agent-qdrant-1 is unhealthy
```

Compose also reported Redis, Postgres, and Neo4j as dependency failures, but current container inspection showed Redis and Postgres were healthy. The primary blocker was Qdrant.

## Evidence

`docker inspect kirakira-agent-qdrant-1` showed the healthcheck repeatedly failed with:

```text
/bin/sh: 1: curl: not found
/bin/sh: 1: wget: not found
```

`docker compose logs qdrant` showed Qdrant itself was running and listening:

```text
Qdrant HTTP listening on 6333
Qdrant gRPC listening on 6334
```

This means the service was healthy, but the healthcheck depended on binaries that are not present in the official Qdrant image.

## Files Changed

- `docker-compose.yml`
- `docker-compose.ports.yml`
- `docs/change-records/README.md`
- `docs/change-records/2026-05-09-docker-compose-healthchecks.md`

## Implementation Details

Replaced Qdrant's HTTP healthcheck command:

```yaml
curl -f http://localhost:6333/healthz || wget -q -O- http://localhost:6333/healthz || exit 1
```

with a dependency-free TCP readiness probe using tools available in the Qdrant container:

```yaml
timeout 2 bash -lc ': > /dev/tcp/127.0.0.1/6333'
```

This checks that the Qdrant REST port accepts TCP connections without requiring `curl` or `wget`.

After fixing Qdrant, `docker compose up -d --force-recreate neo4j` exposed a second startup blocker:

```text
Bind for 0.0.0.0:7474 failed: port is already allocated
```

The interactive agent runs inside the Compose network and reaches services by DNS names such as `neo4j:7687`, `qdrant:6333`, and `kirakirad:17777`. It does not need these service ports published to the Windows host by default.

To avoid host port conflicts, the default `docker-compose.yml` now uses `expose` instead of `ports` for infrastructure services. A separate `docker-compose.ports.yml` override preserves the old published ports for manual debugging.

## Verification Plan

Run:

```powershell
docker compose up -d --force-recreate qdrant
docker inspect kirakira-agent-qdrant-1 --format '{{json .State.Health}}'
docker compose run --rm kirakira-agent
```

Expected result:

- Qdrant reaches `healthy`
- Compose no longer aborts on the Qdrant dependency
- `kirakira-agent` enters the interactive TUI

For host-accessible dashboards or databases, use the optional ports override:

```powershell
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d
```

## Verification Performed

After the Qdrant healthcheck repair:

```powershell
docker inspect kirakira-agent-qdrant-1 --format '{{json .State.Health}}'
```

returned:

```text
"Status":"healthy"
```

After moving host port publishing to `docker-compose.ports.yml`, all default services reached healthy state:

```text
kirakirad  Up ... (healthy)  8181/tcp, 17777/tcp
minio      Up ... (healthy)  9000-9001/tcp
neo4j      Up ... (healthy)  7473-7474/tcp, 7687/tcp
postgres   Up ... (healthy)  5432/tcp
qdrant     Up ... (healthy)  6333-6334/tcp
redis      Up ... (healthy)  6379/tcp
```

`kirakira-agent` container startup was verified with:

```powershell
docker compose run --rm kirakira-agent policy status
docker compose run --rm kirakira-agent --help
```

Observed result:

```text
PDP transport: tcp
PDP health status: healthy
```

## Notes

Neo4j appeared as a dependency failure during the aborted run, but the available logs showed a shutdown request after the dependency chain failed. A later isolated restart exposed the real default-Compose issue: host port `7474` was already allocated. Removing default host port publishing fixed the startup path.
