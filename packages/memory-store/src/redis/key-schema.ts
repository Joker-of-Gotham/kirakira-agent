/**
 * Structured Redis key generator aligned with the design doc key layout:
 *
 *   lock:run:{run_id}                     -> lease token, PX 30000
 *   lock:checkpoint:{run_id}:{step_no}    -> resume lease
 *   stream:memory:materialize             -> outbox fanout
 *   stream:memory:forget                  -> delete propagation
 *   stream:artifact:index                 -> OCR/summary/embed jobs
 *   cache:recall:{tenant}:{hash}          -> serialized MemoryBundle
 *   cache:entity:{tenant}:{canon_name}    -> entity resolution cache
 *   hot:checkpoint:{run_id}               -> latest checkpoint ref
 */

const PREFIX = "kirakira:" as const;

export const RedisKeySchema = {
  lockRun(runId: string): string {
    return `${PREFIX}lock:run:${runId}`;
  },

  lockCheckpoint(runId: string, stepNo: number): string {
    return `${PREFIX}lock:checkpoint:${runId}:${stepNo}`;
  },

  lockGeneric(resource: string): string {
    return `${PREFIX}lock:${resource}`;
  },

  streamMaterialize: `${PREFIX}stream:memory:materialize`,
  streamForget: `${PREFIX}stream:memory:forget`,
  streamArtifactIndex: `${PREFIX}stream:artifact:index`,
  streamReflect: `${PREFIX}stream:memory:reflect`,

  cacheRecall(tenantId: string, queryHash: string): string {
    return `${PREFIX}cache:recall:${tenantId}:${queryHash}`;
  },

  cacheEntity(tenantId: string, canonName: string): string {
    return `${PREFIX}cache:entity:${tenantId}:${canonName}`;
  },

  cacheGeneric(namespace: string, key: string): string {
    return `${PREFIX}cache:${namespace}:${key}`;
  },

  hotCheckpoint(runId: string): string {
    return `${PREFIX}hot:checkpoint:${runId}`;
  },

  hotRunState(runId: string): string {
    return `${PREFIX}hot:run:${runId}`;
  },

  /** Pattern for SCAN-based cache invalidation for a tenant. */
  cachePatternForTenant(tenantId: string): string {
    return `${PREFIX}cache:*:${tenantId}:*`;
  },
} as const;
