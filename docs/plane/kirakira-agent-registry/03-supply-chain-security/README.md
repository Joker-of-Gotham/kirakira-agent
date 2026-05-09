# Supply Chain Security

## Digest Verification

Every package has a `sha256:` prefixed digest. During installation:

1. Fetcher downloads the artifact to a temp location
2. Verifier computes `sha256` of the local file
3. Comparison against the expected digest — mismatch throws `DigestMismatchError`

## Signature Verification

Optional Sigstore/cosign-compatible signatures:

- Base64-encoded detached signatures stored alongside the package
- Verified against publisher's public key or Sigstore certificate
- `verifySignature()` checks structure and length; full verification integrates with cosign binary

## Provenance

```typescript
interface ProvenanceInfo {
  buildType: string;         // "ci" | "manual"
  builder: string;           // "github-actions" | "local"
  sourceRepo?: string;       // git origin URL
  sourceCommit?: string;     // commit SHA
  buildTimestamp: string;    // ISO 8601
  attestationDigest?: string;
}
```

## Lockfile Integrity

`validateLockIntegrity()` checks every lockfile entry's digest against the local cache blob, detecting any post-install tampering.
