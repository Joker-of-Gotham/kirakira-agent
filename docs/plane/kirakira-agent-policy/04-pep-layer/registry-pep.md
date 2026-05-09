# Registry PEP

Govern **`package.install`** pathways (npm, pnpm, yarn, pip, cargo, mise, brew under automation). Addresses **typosquatting**, tarball integrity drift, unpublished git SHA references.

Upstream context: [`README.md`](./README.md).

---

## Interception responsibilities

| Task | Detail |
| ---- | ------- |
| **Package identity capture** | name@version (+ provenance URIs, git SHAs). |
| **Lock parity** | If lockfile forbids drifting resolution, PEP flags `risk.lock_violation`. |
| **Script hooks** (`postinstall`) | Automatically raises supply-chain classification. |

Populate `normalized` with arrays `packages[]`:

```yaml
normalized:
  packages:
    - ecosystem: npm
      name: left-pad-typo-squat
      version_range: "^1.0.0"
      resolved_shasum: "...optional..."
```

---

## Supply chain scoring interface

Defer deeper analytics to AIRISK feeding composite `scores.supply_chain`—Registry PEP MUST pass facts, not guesses (no hidden network lookups here).

Organization may hydrate PDP `data.registry_trust_scores` keyed by tarball hash.

---

## Execution pathway

Installation typically requires BOTH:

1. PDP `allow`.
2. Network obligations for registry domains (union of NPM/PyPI).

Deny insecure mixed HTTP mirrors unless offline policy exception signed.

---

## Failure outcomes

| Event | Reaction |
| ----- | --------- |
| Signature verification failure (`npm audit signatures`) | DENY (`reason_codes.supply.signature_invalid`) |
| Policy mandates reproducible installs but unresolved graph | DENY |

---

## Cross-links

- AIRISK classifications for risky ecosystems: [`../06-airisk/README.md`](../06-airisk/README.md)
- MCP indirect installs: MCP may escalate to Registry PEP when MCP tool triggers installs
