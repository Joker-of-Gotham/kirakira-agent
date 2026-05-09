# Fingerprint algorithm — approvals & templates

Fingerprints stabilize **equality** judgments over semantically-equivalent PEP actions despite harmless syntactic jitter (key order, whitespace, ephemeral telemetry).

Primary standards:

| Concern | Standard / algorithm |
| ------- | -------------------- |
| JSON canonicalization | **RFC 8785** canonical JSON (**JCS**) |
| Digest | **BLAKE3** (256-bit output hex-encoded lowercase) |

Schema references: [`../03-data-model/approval-record.md`](../03-data-model/approval-record.md).

---

## Pipeline overview

```
PolicyInput normalized subset
      ↓ ephemeral field strip
      ↓ deterministic sort (RFC 8785)
      → UTF-8 bytes
      → BLAKE3.digest
      → fingerprints.exact
```

Parallel **template variant**:

```
canonical object
      ↓ apply template stripping grammar (glob fields)
      → canonical JSON RFC 8785
      → BLAKE3.digest
      → fingerprints.template
```

---

## Canonicalization details

RFC 8785 ensures:

| Property | Requirement |
| -------- | ----------- |
| Object key ordering | Lexicographic by UTF-16 code units per spec |
| Number formatting | Shortest_roundtrip deterministic encoding |

Implementations SHOULD delegate to audited libraries binding **ietf-json-canonicalization** semantics.

---

## BLAKE3 parameters

```
output_length = 32 bytes
personalization/context label optional distinct bytes ("Kirakira-APRV1")
```

Keyed mode MAY be activated for keyed approval HMAC bridging HSM—document key ids externally.

---

## Ephemeral field filtering (exact fingerprint)

**Removed** subtree keys typically include:

| Path | Reason |
| ---- | ------ |
| `trace.parent_span_micros` | High-cardinality jitter |
| `risk.ephemeral_hints` | Model-sampled noise |
| `context.request_sequence` noisy counters | Presentation-only |

Maintain authoritative remove-list `APPROVAL_FINGERPRINT_DROP_PATHS.json` shipped with **`@kirakira/policy-engine`**.

Template fingerprint applies **additional** removals (e.g. drop volatile argument noise like temporary build ids) defined per `template_id`.

---

## Stability guarantees

Fingerprints intentionally **remain stable across**:

| Change | Stability |
| ------ | --------- |
| Reordering of JSON keys in source | ✅ |
| Equivalent numeric forms after canonicalization | ✅ |

Fingerprints SHOULD update when materially security-relevant mutations occur—for example altering **target path**, **domains**, **`operation` verbs**, **`tool_name`** composite id.

---

## Collision handling

Treat BLAKE3 collision as practically impossible—nonetheless PDP logs **dual verification** optionally comparing normalized raw string forms on mismatch suspicion.

---

## Testing vectors

Maintain golden fixtures verifying cross-language hashing parity prelude to codegen milestone [`../03-data-model/cross-language-alignment.md`](../03-data-model/cross-language-alignment.md).

---

## Cross-links

- Cache interplay: [`./cache-strategy.md`](./cache-strategy.md)
- PDP template approval mode [`../03-data-model/policy-decision.md`](../03-data-model/policy-decision.md)
