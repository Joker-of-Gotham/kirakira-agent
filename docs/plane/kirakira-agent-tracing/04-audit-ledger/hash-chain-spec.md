# Hash-chain specification — BLAKE3

Each append batch forms a cryptographic chain preventing silent historical tampering inside local ledger files.

Upstream overview: [`README.md`](./README.md).

---

## Symbols

Let `‖` denote byte concatenation, and `Blake3Raw(M)` the raw 256-bit BLAKE3 hash of message `M`.

---

## Segment record fields

Minimal row prior to hashing:

```
seq: monotonic uint64 segment-wide
timestamp: RFC3339Nano UTC
payload_type: enumerated (policy_eval,approval_change,sandbox_activate, ...)
body: canonical JSON RFC8785 excluding chain fields
prev_hash: 32-byte prior link or sentinel zeros on genesis
writer_id: deterministic instance uuid
```

---

## Link equation

Genesis:

```
GENESIS_PREV := 32 zero bytes

row_digest := Blake3Raw(
    u64_be(seq)
    ‖ timestamp_utf8_fixed
    ‖ payload_type_ascii
    ‖ body_canonical_utf8_bytes
    ‖ prev_hash
    ‖ writer_uuid_bytes
)
```

Expose externally as **`blake3:hex(lower)`**.

---

## Segment rotation

Rolling file **`segment-YYYYMMDDHHMM.ss`**: upon size threshold (~128MiB) or hourly timer finalize:

```
segment_root := MerkleThinAggregate(row_digest_list) Optional optimization
Alternatively linear chain simplifies audit—choose linear MVP.
```

Thin Merkle OPTIONAL for parallel verification—default **linear authenticity** verifying streaming.

---

## Verification algorithm

Pseudo:

```
prev = GENESIS_PREV
for row in ordered_rows ASC seq:
    recompute_digest(row, prev)
    assert digest == stored row_digest_field
    prev = digest
```

---

## Performance

BLAKE3 chosen for SIMD throughput on developer laptops hashing high volume audit traffic.

---

## Cross-links

Checkpoint aggregation: [`checkpoint-spec.md`](./checkpoint-spec.md)
