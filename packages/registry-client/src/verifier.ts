/**
 * Supply chain security: digest verification and signature checking.
 *
 * Verifies sha256 digests and optionally Sigstore/cosign-compatible signatures.
 */

import { readFileSync } from "node:fs";
import { createVerify } from "node:crypto";
import { sha256Prefixed, DigestMismatchError } from "@kirakira/core";
import type { VerifyResult } from "./types.js";

export function verifyDigest(filePath: string, expectedDigest: string): VerifyResult {
  let content: Buffer;
  try {
    content = readFileSync(filePath);
  } catch (e) {
    return {
      valid: false,
      digest: "",
      error: `Cannot read file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const actualDigest = sha256Prefixed(content);

  if (actualDigest !== expectedDigest) {
    return {
      valid: false,
      digest: actualDigest,
      error: `Digest mismatch: expected ${expectedDigest}, got ${actualDigest}`,
    };
  }

  return { valid: true, digest: actualDigest };
}

export function verifyDigestOrThrow(filePath: string, expectedDigest: string): void {
  const result = verifyDigest(filePath, expectedDigest);
  if (!result.valid) {
    throw new DigestMismatchError(expectedDigest, result.digest);
  }
}

/**
 * Verify a detached signature using Node.js crypto.
 *
 * Supports PEM public keys (RSA, EC) with base64-encoded detached signatures.
 * Uses Node's native `crypto.createVerify` for cryptographic verification.
 */
export function verifySignature(
  blobDigest: string,
  signature: string,
  publicKeyPem?: string,
): VerifyResult {
  if (!signature || signature.length < 10) {
    return {
      valid: false,
      digest: blobDigest,
      signatureValid: false,
      error: "Signature too short or missing",
    };
  }

  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(signature, "base64");
    if (sigBytes.length < 32) {
      return {
        valid: false,
        digest: blobDigest,
        signatureValid: false,
        error: "Decoded signature too short",
      };
    }
  } catch {
    return {
      valid: false,
      digest: blobDigest,
      signatureValid: false,
      error: "Invalid base64 signature",
    };
  }

  if (!publicKeyPem) {
    return {
      valid: false,
      digest: blobDigest,
      signatureValid: false,
      error: "No public key provided — cannot verify signature cryptographically",
    };
  }

  const digestHex = blobDigest.startsWith("sha256:")
    ? blobDigest.slice(7)
    : blobDigest;
  const data = Buffer.from(digestHex, "hex");

  const verifier = createVerify("SHA256");
  verifier.update(data);
  verifier.end();

  try {
    const isValid = verifier.verify(publicKeyPem, sigBytes);
    return {
      valid: isValid,
      digest: blobDigest,
      signatureValid: isValid,
      error: isValid ? undefined : "Signature verification failed — signature does not match digest with provided key",
    };
  } catch (e) {
    return {
      valid: false,
      digest: blobDigest,
      signatureValid: false,
      error: `Crypto verification error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
