import { describe, expect, it } from "vitest";
import {
  BLOB_PATHS,
  DEFAULT_RECALL_CONFIG,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_LABELS,
  MEMORY_COLLECTIONS,
  MEMORY_ID_PREFIX,
  PERFORMANCE_TARGETS,
  REDIS_KEY_PREFIX,
  REDIS_STREAMS,
  RETAIN_CONFIG,
  SCHEMA_VERSIONS_MEMORY,
} from "@kirakira/memory-core";

describe("MEMORY_ID_PREFIX", () => {
  it("has all expected keys", () => {
    expect(Object.keys(MEMORY_ID_PREFIX).sort()).toEqual(
      [
        "artifactMeta",
        "belief",
        "checkpoint",
        "episode",
        "exportJob",
        "fact",
        "forgetJob",
        "graphEdge",
        "graphNode",
        "memoryBundle",
        "memoryRecord",
        "observation",
        "preference",
        "retrievalTrace",
        "vectorItem",
      ].sort(),
    );
  });
});

describe("MEMORY_COLLECTIONS", () => {
  it("has expected collection names", () => {
    expect(MEMORY_COLLECTIONS).toEqual({
      episodeDense: "mem_episode_dense",
      factDense: "mem_fact_dense",
      observationDense: "mem_observation_dense",
      artifactDense: "mem_artifact_dense",
      checkpointDense: "mem_checkpoint_dense",
      hybrid: "mem_hybrid",
    });
  });
});

describe("GRAPH_NODE_LABELS", () => {
  it("contains all 9 labels", () => {
    expect(GRAPH_NODE_LABELS).toHaveLength(9);
    expect([...GRAPH_NODE_LABELS]).toEqual([
      "Entity",
      "Episode",
      "Fact",
      "Observation",
      "Belief",
      "Artifact",
      "Run",
      "Checkpoint",
      "ConceptCluster",
    ]);
  });
});

describe("GRAPH_EDGE_TYPES", () => {
  it("contains all 10 edge types", () => {
    expect(GRAPH_EDGE_TYPES).toHaveLength(10);
    expect([...GRAPH_EDGE_TYPES]).toEqual([
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
    ]);
  });
});

describe("Redis and blob constants", () => {
  it("REDIS_KEY_PREFIX matches expected shape", () => {
    expect(REDIS_KEY_PREFIX).toEqual({
      lock: "kirakira:lock:",
      stream: "kirakira:stream:",
      cache: "kirakira:cache:",
      hot: "kirakira:hot:",
    });
  });

  it("REDIS_STREAMS matches expected values", () => {
    expect(REDIS_STREAMS).toEqual({
      materialize: "kirakira:stream:memory:materialize",
      forget: "kirakira:stream:memory:forget",
      artifactIndex: "kirakira:stream:artifact:index",
      reflect: "kirakira:stream:memory:reflect",
    });
  });

  it("BLOB_PATHS matches expected paths", () => {
    expect(BLOB_PATHS).toEqual({
      episodes: "episodes",
      artifacts: "artifacts",
      checkpoints: "checkpoints",
      exports: "exports",
      audit: "audit",
    });
  });
});

describe("SCHEMA_VERSIONS_MEMORY", () => {
  it("matches expected version map", () => {
    expect(SCHEMA_VERSIONS_MEMORY).toEqual({
      memoryRecord: 1,
      episode: 1,
      checkpoint: 1,
      outboxEvent: 1,
      retrievalTrace: 1,
      contextBundle: 1,
    });
  });
});

describe("DEFAULT_RECALL_CONFIG", () => {
  it("has fusion weights summing to approximately 1.0", () => {
    const sum =
      DEFAULT_RECALL_CONFIG.similarityWeight +
      DEFAULT_RECALL_CONFIG.graphWeight +
      DEFAULT_RECALL_CONFIG.temporalWeight +
      DEFAULT_RECALL_CONFIG.stateWeight;
    expect(sum).toBeCloseTo(1.0, 6);
  });
});

describe("RETAIN_CONFIG", () => {
  it("has thresholds within valid ranges", () => {
    expect(RETAIN_CONFIG.maxEpisodeSegments).toBeGreaterThan(0);
    expect(RETAIN_CONFIG.defaultSegmentationThreshold).toBeGreaterThanOrEqual(0);
    expect(RETAIN_CONFIG.defaultSegmentationThreshold).toBeLessThanOrEqual(1);
    expect(RETAIN_CONFIG.minConfidenceForFact).toBeGreaterThanOrEqual(0);
    expect(RETAIN_CONFIG.minConfidenceForFact).toBeLessThanOrEqual(1);
    expect(RETAIN_CONFIG.minConfidenceForBelief).toBeGreaterThanOrEqual(0);
    expect(RETAIN_CONFIG.minConfidenceForBelief).toBeLessThanOrEqual(1);
    expect(RETAIN_CONFIG.minConfidenceForFact).toBeGreaterThanOrEqual(
      RETAIN_CONFIG.minConfidenceForBelief,
    );
  });
});

describe("PERFORMANCE_TARGETS", () => {
  it("has strictly positive millisecond targets", () => {
    for (const value of Object.values(PERFORMANCE_TARGETS)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});