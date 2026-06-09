// Postgres
export { createPgClient, type PgClientConfig } from "./postgres/client.js";
export type { PgSql } from "./postgres/pg-sql.js";
export {
  runMigrations,
  listAppliedMigrations,
  MigrationError,
  type MigrationRunnerOptions,
  type MigrationRecord,
} from "./postgres/migrator.js";
export { ensurePartitions, type PartitionManagerOptions } from "./postgres/partition-manager.js";
export type { MemoryRecordFilter } from "./postgres/record-filter.js";
export { MemoryRecordRepository, type MemoryRecordRepoOptions } from "./postgres/repositories/memory-record-repo.js";
export { EpisodeRepository, type EpisodeRepoOptions } from "./postgres/repositories/episode-repo.js";
export {
  PostgresCheckpointRepository,
  type PostgresCheckpointRepositoryOptions,
} from "./postgres/repositories/checkpoint-repo.js";
export {
  PostgresCheckpointEnvelopeRepository,
  type PostgresCheckpointEnvelopeRepositoryOptions,
} from "./postgres/repositories/checkpoint-envelope-repo.js";
export { ArtifactMetaRepository, type ArtifactMetaRepoOptions } from "./postgres/repositories/artifact-meta-repo.js";
export {
  OutboxRepository,
  type OutboxEventInsert,
  type OutboxRepositoryOptions,
  type OutboxRow,
  type OutboxStatus,
} from "./postgres/repositories/outbox-repo.js";
export {
  DeletionJobRepository,
  type DeletionJob,
  type DeletionJobRepositoryOptions,
  type DeletionJobStatus,
} from "./postgres/repositories/deletion-job-repo.js";

// Redis
export { createRedisClient, type RedisClient, type RedisClientConfig } from "./redis/client.js";
export { RedisKeySchema } from "./redis/key-schema.js";
export { LockManager, type LockHandle } from "./redis/lock-manager.js";
export { StreamProducer, type StreamMessage } from "./redis/stream-producer.js";
export { StreamConsumer, type ConsumedMessage, type ConsumerConfig } from "./redis/stream-consumer.js";
export { CacheManager } from "./redis/cache-manager.js";

// Blob
export { S3BlobClient, type BlobConfig, type S3BlobClientConfig } from "./blob/s3-client.js";
export { BlobPathBuilder, type BlobPathBuilderConfig } from "./blob/path-builder.js";
export { WormManager, type WormManagerConfig } from "./blob/worm-manager.js";
export { FsBlobAdapter } from "./blob/fs-adapter.js";
export { createBlobStack, type BlobAdapterFactoryConfig, type BlobStack, type BlobBackend } from "./blob/adapter-factory.js";

// Outbox
export { calculateBackoffDelayMs, type BackoffOptions } from "./outbox/retry-policy.js";
export {
  createDefaultDispatcher,
  resolveStreamOrThrow,
  type StreamRouter,
} from "./outbox/dispatcher.js";
export { OutboxProcessor, type OutboxProcessorOptions } from "./outbox/processor.js";
export { OutboxReconciler, type ReconcilerOptions, type VerifyResult } from "./outbox/reconciler.js";
