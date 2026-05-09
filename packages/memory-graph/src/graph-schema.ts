export const NODE_CONSTRAINTS = [
  { label: "Entity", property: "id", type: "UNIQUE" as const },
  { label: "Episode", property: "id", type: "UNIQUE" as const },
  { label: "Fact", property: "id", type: "UNIQUE" as const },
  { label: "Observation", property: "id", type: "UNIQUE" as const },
  { label: "Belief", property: "id", type: "UNIQUE" as const },
  { label: "Artifact", property: "id", type: "UNIQUE" as const },
  { label: "Run", property: "id", type: "UNIQUE" as const },
  { label: "Checkpoint", property: "id", type: "UNIQUE" as const },
  { label: "ConceptCluster", property: "id", type: "UNIQUE" as const },
] as const;

export const NODE_INDEXES = [
  { label: "Entity", property: "tenant_id", type: "BTREE" as const },
  { label: "Entity", property: "name", type: "TEXT" as const },
  { label: "Fact", property: "tenant_id", type: "BTREE" as const },
  { label: "Episode", property: "tenant_id", type: "BTREE" as const },
  { label: "Episode", property: "created_at", type: "BTREE" as const },
] as const;

export const EDGE_TYPES_WITH_TEMPORAL = [
  "ABOUT",
  "DERIVED_FROM",
  "SUPPORTS",
  "REFUTES",
] as const;
