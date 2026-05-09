# Signing specification — Ed25519 checkpoints

Elevates local hash integrity to **authenticated checkpoints** resisting tampering if attacker obtains disk but lacks signing key quorum.

Upstream: [`README.md`](./README.md).

---

## Key algorithm

Algorithm: **`Ed25519`** (RFC 8032).

| Role | Responsibility |
| ---- | ----------- |
| **Active signing key (`K_curr`)** | Signs each checkpoint finalized |
| **Next rotation key (`K_next`)** | Advertised preemptively |

---

## Key management tiers

| Tier | Practice |
| ---- | --------- |
| Dev | Ephemeral locally generated PEM **non-prod** only |
| Staging | KMS-backed asymmetric key referencing alias |
| Production | Dual-control HSM with quarterly rotation SLA |

Never embed private seeds in repos.

---

## Signature payload (canonical bytes)

Assemble deterministic fields **in fixed order**, then compute:

```
message_bytes = version_byte ‖ checkpoint_id_utf8 ‖ aggregate_root_32 ‖
                producer_node_id_utf8 ‖ finalize_unix_nanos_u64be ‖
                prior_checkpoint_hash_32 ‖ bundle_revision_utf8_marker

signature := Ed25519_sign(secret_key, message_bytes)
```

| Piece | Meaning |
| ----- | ------- |
| `version_byte` | `0x01` |
| `checkpoint_id_utf8` | UTF-8 checkpoint id |
| `aggregate_root_32` | 32-byte root from checkpoint spec |
| `producer_node_id_utf8` | Writer node id |
| `finalize_unix_nanos_u64be` | Big-endian wall-time bound |
| `prior_checkpoint_hash_32` | 32-byte prior link or zero bytes at genesis |
| `bundle_revision_utf8_marker` | ASCII revision string or single `0x00` sentinel if absent |

Protobuf `CheckpointSignable` (**schema TBD**) may mirror this layout for multi-language codegen.

---

## Verification path

Consumers:

```
kirakira audit verify --checkpoint SIGNABLE_BLOB --signature SIG --pubkey PEM
```

Chain trust anchors via internal PKI pinning file `trusted_checkpoint_keys.pem` versioned centrally.

Revocation list (`crl.pem`) distributes via config management.

---

## Failure handling

Tampered checkpoint MUST raise:

```
exit_code_audit_signature_invalid (unique code)
SOC alert template ID TBD referencing detection rules SIEM mapping.
```

---

## Cross-links

Remote transparency logging optional overlay: [`remote-anchoring.md`](./remote-anchoring.md)
