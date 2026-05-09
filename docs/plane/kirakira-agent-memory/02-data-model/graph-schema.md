# Graph schema — Temporal knowledge projection

The **graph database** (Neo4j, Kuzu, or AGE) is a **materialized index** over Postgres truth. It optimizes **multi-hop retrieval**, **temporal validity**, and **explainability** (paths as citations).

See [`README.md`](README.md).

---

## Node labels (9)

| Label | Description | Primary keys / indexes |
|-------|-------------|------------------------|
| **Entity** | Canonical world/workspace entities | `tenant_id + canon_id` |
| **Episode** | Semantic span nodes | `id` |
| **Fact** | Evidentiary statements (may also be modeled as reified edges) | `id` |
| **Observation** | Consolidated summaries | `id` |
| **Belief** | Inferential statements | `id` |
| **Artifact** | Blob-backed artifacts | `id` + `sha256` |
| **Run** | Orchestration run / thread host | `run_id` |
| **Checkpoint** | Step boundary | `id` |
| **ConceptCluster** | Hierarchical topic/entity community | `id` |

Every node SHOULD carry:

- `tenant_id: string`
- `workspace_id: string` (except global Org nodes—policy defined)
- `namespace: string`
- `created_at: datetime` (transaction time insertion)

---

## Relationship types (10)

| Type | From → To | Semantics |
|------|-----------|-----------|
| **ABOUT** | Fact → Entity | Fact asserts a proposition about an entity |
| **MENTIONS** | Episode → Entity | Surface mention / linkage |
| **DERIVED_FROM** | Observation / Belief → Fact | Grounding edges |
| **SUPPORTS** | Belief → Fact/Observation | Positive evidentiary link |
| **REFUTES** | Belief → Fact/Observation | Negative evidentiary link |
| **NEXT_EPISODE** | Episode → Episode | Temporal chain within a session |
| **PART_OF_RUN** | Episode / Checkpoint → Run | Execution grouping |
| **HAS_CHECKPOINT** | Run → Checkpoint | Ordered durability ladder |
| **IN_CLUSTER** | Entity/Episode → ConceptCluster | Mnemis hierarchical route |
| **CONTAINS** | Episode → Fact | Containment of extracted facts |

**Temporal edges:** Relationships may carry:

| Property | Meaning |
|----------|---------|
| `valid_at`, `invalid_at` | **Event time** the relationship statement holds |
| `created_at`, `expired_at` | **System time** the edge is known / retired |

This mirrors Zep/Graphiti dual timestamps: **when it was true** vs **when we knew it**.

---

## Modeling notes

**Fact as node vs edge:** The reference stack uses **`Fact` nodes** for uniform properties and attachment to embeddings. Alternatively, facts may be **reified relationships** (`(s)-[r:FACT {text, valid...}]->(o)`); pick one style per deployment and keep mapping stable for Cypher generators.

**Point-in-time queries:** Apply filters on relationships **first**, then expand, to avoid invalid-time path explosions:

```cypher
MATCH ()-[r:SUPPORTS]->()
WHERE r.created_at <= datetime($asOfTx)
  AND (r.expired_at IS NULL OR r.expired_at > datetime($asOfTx))
```

---

## Cypher examples

### Merge canonical entity + episode + fact with temporal properties

```cypher
MERGE (e:Entity {tenant_id: $tenant, canon_id: $canon_id})
  ON CREATE SET e.name = $name, e.created_at = datetime()

MERGE (ep:Episode {id: $episode_id, tenant_id: $tenant})
  SET ep.source_type = $source_type,
      ep.created_at = datetime($tx_from),
      ep.valid_at = datetime($valid_from)

MERGE (f:Fact {id: $fact_id, tenant_id: $tenant})
  SET f.text = $fact_text,
      f.valid_at = datetime($valid_from),
      f.invalid_at = CASE WHEN $valid_to IS NULL THEN NULL ELSE datetime($valid_to) END,
      f.created_at = datetime($tx_from),
      f.confidence = $confidence

MERGE (ep)-[:CONTAINS {created_at: datetime($tx_from)}]->(f)
MERGE (f)-[:ABOUT {valid_at: datetime($valid_from)}]->(e)
```

### Expand neighborhood for recall seed

```cypher
MATCH (seed:Entity {tenant_id: $tenant, canon_id: $seed})
MATCH path = (seed)<-[:ABOUT|MENTIONS*1..3]-(n)
WHERE ALL(r IN relationships(path) WHERE
  coalesce(r.invalid_at, datetime('9999-12-31T00:00:00Z')) > datetime($queryInstant))
RETURN path
LIMIT 50
```

### Attach belief with support edges

```cypher
MERGE (b:Belief {id: $belief_id, tenant_id: $tenant})
SET b.statement = $statement,
    b.confidence = $confidence,
    b.created_at = datetime()

WITH b
UNWIND $support_fact_ids AS fid
MATCH (f:Fact {id: fid, tenant_id: $tenant})
MERGE (b)-[:SUPPORTS {created_at: datetime()}]->(f)
```

---

## Indexing recommendations (Neo4j-flavored)

- BTREE / RANGE on `tenant_id`, `id`, `created_at`
- Full-text on `Fact.text`, `Observation.summary`, `Belief.statement` (optional second route)
- Vector index on `Observation.embedding` if stored dual-mode

Consult backend-specific guides for Kuzu vs Neo4j syntax differences.

Related: [`vector-schema.md`](vector-schema.md), [`../01-architecture/data-flow.md`](../01-architecture/data-flow.md).
