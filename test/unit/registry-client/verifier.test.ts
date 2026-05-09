import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { generateKeyPairSync, createSign, createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Prefixed } from "../../../packages/core/src/utils/digest.js";
import { verifyDigest, verifyDigestOrThrow, verifySignature } from "../../../packages/registry-client/src/verifier.js";

describe("verifyDigest", () => {
  it("returns valid for matching digest", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-verify-"));
    const content = Buffer.from("test content for verification");
    const expected = sha256Prefixed(content);
    const filePath = path.join(dir, "blob");
    await writeFile(filePath, content);

    const result = verifyDigest(filePath, expected);
    expect(result.valid).toBe(true);
    expect(result.digest).toBe(expected);

    await rm(dir, { recursive: true, force: true });
  });

  it("returns invalid for tampered content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-verify-"));
    const original = Buffer.from("original content");
    const expected = sha256Prefixed(original);
    const tampered = Buffer.from("tampered content");
    const filePath = path.join(dir, "blob");
    await writeFile(filePath, tampered);

    const result = verifyDigest(filePath, expected);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mismatch");

    await rm(dir, { recursive: true, force: true });
  });

  it("returns invalid for missing file", () => {
    const result = verifyDigest("/nonexistent/path/blob", "sha256:abc");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Cannot read file");
  });
});

describe("verifyDigestOrThrow", () => {
  it("throws DigestMismatchError on mismatch", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-verify-"));
    await writeFile(path.join(dir, "blob"), "wrong content");

    expect(() =>
      verifyDigestOrThrow(
        path.join(dir, "blob"),
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toThrow("Expected sha256:");

    await rm(dir, { recursive: true, force: true });
  });
});

describe("verifySignature", () => {
  it("rejects empty or short signatures", () => {
    const r = verifySignature("sha256:abc", "");
    expect(r.valid).toBe(false);
    expect(r.signatureValid).toBe(false);
  });

  it("rejects non-base64 signatures", () => {
    const r = verifySignature("sha256:abc", "not!valid!base64!!!");
    expect(r.valid).toBe(false);
  });

  it("returns valid=false and signatureValid=false when no public key provided", () => {
    const sig = Buffer.alloc(64, 0xff).toString("base64");
    const r = verifySignature("sha256:abc", sig);
    expect(r.valid).toBe(false);
    expect(r.signatureValid).toBe(false);
    expect(r.error).toContain("No public key provided");
  });

  it("verifies a real cryptographic signature with a key pair", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const digestHex = createHash("sha256").update("test blob data").digest("hex");
    const blobDigest = `sha256:${digestHex}`;

    const signer = createSign("SHA256");
    signer.update(Buffer.from(digestHex, "hex"));
    signer.end();
    const sig = signer.sign(privateKey).toString("base64");

    const r = verifySignature(blobDigest, sig, publicKey);
    expect(r.valid).toBe(true);
    expect(r.signatureValid).toBe(true);
  });

  it("rejects an invalid signature against a key pair", () => {
    const { publicKey } = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const digestHex = createHash("sha256").update("test blob data").digest("hex");
    const blobDigest = `sha256:${digestHex}`;
    const fakeSig = Buffer.alloc(72, 0xab).toString("base64");

    const r = verifySignature(blobDigest, fakeSig, publicKey);
    expect(r.valid).toBe(false);
    expect(r.signatureValid).toBe(false);
  });
});
