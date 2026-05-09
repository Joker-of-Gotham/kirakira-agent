export const MEMORY_ID_PREFIX = {
  memoryRecord: "mem_",
  episode: "epi_",
  fact: "fct_",
  belief: "blf_",
  observation: "obs_",
  preference: "prf_",
  checkpoint: "ckp_",
  artifactMeta: "art_",
  vectorItem: "vec_",
  graphNode: "gnd_",
  graphEdge: "ged_",
  memoryBundle: "bnd_",
  retrievalTrace: "rtc_",
  forgetJob: "fgj_",
  exportJob: "exj_",
} as const;

export const MEMORY_COLLECTIONS = {
  episodeDense: "mem_episode_dense",
  factDense: "mem_fact_dense",
  observationDense: "mem_observation_dense",
  artifactDense: "mem_artifact_dense",
  checkpointDense: "mem_checkpoint_dense",
  hybrid: "mem_hybrid",
} as const;

export const GRAPH_NODE_LABELS = [
  "Entity",
  "Episode",
  "Fact",
  "Observation",
  "Belief",
  "Artifact",
  "Run",
  "Checkpoint",
  "ConceptCluster",
] as const;

export const GRAPH_EDGE_TYPES = [
  "ABOUT",
  "MENTIONS",
  "DERIVED_FROM",
  "SUPPORTS",
  "REFUTES",
  "NEXT_EPISODE",
  "PART_OF_RUN",
  "HAS_CHECKPOINT",
  "IN_CLUSTER",
  "CONTAINS",
] as const;

export const REDIS_KEY_PREFIX = {
  lock: "kirakira:lock:",
  stream: "kirakira:stream:",
  cache: "kirakira:cache:",
  hot: "kirakira:hot:",
} as const;

export const REDIS_STREAMS = {
  materialize: "kirakira:stream:memory:materialize",
  forget: "kirakira:stream:memory:forget",
  artifactIndex: "kirakira:stream:artifact:index",
  reflect: "kirakira:stream:memory:reflect",
} as const;

export const BLOB_PATHS = {
  episodes: "episodes",
  artifacts: "artifacts",
  checkpoints: "checkpoints",
  exports: "exports",
  audit: "audit",
} as const;

export const SCHEMA_VERSIONS_MEMORY = {
  memoryRecord: 1,
  episode: 1,
  checkpoint: 1,
  outboxEvent: 1,
  retrievalTrace: 1,
  contextBundle: 1,
} as const;

export const DEFAULT_RECALL_CONFIG = {
  maxRoutes: 4,
  defaultLimit: 20,
  defaultTokenBudget: 4000,
  defaultLevel: "L2" as const,
  similarityWeight: 0.35,
  graphWeight: 0.25,
  temporalWeight: 0.20,
  stateWeight: 0.20,
  coverageBonus: 0.1,
  redundancyPenalty: 0.05,
} as const;

export const RETAIN_CONFIG = {
  maxEpisodeSegments: 50,
  defaultSegmentationThreshold: 0.7,
  minConfidenceForFact: 0.5,
  minConfidenceForBelief: 0.3,
} as const;

export const PERFORMANCE_TARGETS = {
  retainSyncP95Ms: 200,
  recallHotCacheP50Ms: 80,
  recallMixedP95Ms: 800,
  recallFullP95Ms: 1500,
  checkpointP95Ms: 150,
  restoreP95Ms: 2000,
} as const;
