# Checkpoint specification

Periodic **checkpoint** snapshots aggregate contiguous ledger segments simplifying verification & remote anchoring.

Related: [`hash-chain-spec.md`](./hash-chain-spec.md), [`signing-spec.md`](./signing-spec.md).

---

## Cadence triggers

| Trigger | Typical value |
| ------- | ------------- |
| Time | hourly wall clock drift ≤ 60s skew tolerance |
| Event count | every 250k appended rows whichever earlier |
| Policy bundle reload | Mandatory checkpoint annotate active revision |

---

## Checkpoint record structure

Fields:

```
checkpoint_id UUIDv7 preferred
segments_covered inclusive range identifiers
aggregate_root BLAKE3 over ordered concatenation leaf digests optional merkle approach
prior_checkpoint_hash link
producer_node_id
started_at finalized_at durations
signature optional until signing enabled epoch
```

---

## Root computation (linear chaining variant)

Define ordered list digest sequence `d1..dn` contiguous across rotation boundary:

```
root := Blake3Raw( d1 ‖ d2 ‖ ... ‖ dn )
```

Alternative Merkle reduces proof sizes—trade CPU + complexity.

---

## Verification stages

Operators run:

```
kirakira audit verify --checkpoint <id>
```

Stages:

1. Rebuild segment linear chain validating each incremental link.
2. Recompute spanning root hash compare.
3. Validate Ed25519 signature per signing spec—optional mode.

Failures classify severity P1 investigative unless known maintenance window flagged.

---

## Compaction interplay

Historical segment files gzip cold tier—must retain ability to decompress & stream verify without mutating cryptographic material.

Compaction MUST NOT reorder rows.

---

## Cross-links

Remote publish flow: [`remote-anchoring.md`](./remote-anchoring.md)
