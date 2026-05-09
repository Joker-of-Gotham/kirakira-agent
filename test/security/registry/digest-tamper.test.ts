import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256Prefixed } from "../../../packages/core/src/utils/digest.js";
import { verifyDigest, verifyDigestOrThrow } from "../../../packages/registry-client/src/verifier.js";

describe("security: digest tamper resistance", () => {
  it("detects single-byte tampering", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-sec-"));
    const original = Buffer.from("authentic package content");
    const digest = sha256Prefixed(original);

    const tampered = Buffer.from(original);
    tampered[0] = tampered[0]! ^ 0xff;
    await writeFile(path.join(dir, "blob"), tampered);

    const result = verifyDigest(path.join(dir, "blob"), digest);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mismatch");

    await rm(dir, { recursive: true, force: true });
  });

  it("detects appended data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-sec-"));
    const original = Buffer.from("original content");
    const digest = sha256Prefixed(original);

    const appended = Buffer.concat([original, Buffer.from("injected")]);
    await writeFile(path.join(dir, "blob"), appended);

    const result = verifyDigest(path.join(dir, "blob"), digest);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mismatch");

    await rm(dir, { recursive: true, force: true });
  });

  it("detects truncated data", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-sec-"));
    const original = Buffer.from("long original content for testing");
    const digest = sha256Prefixed(original);

    const truncated = original.subarray(0, 10);
    await writeFile(path.join(dir, "blob"), truncated);

    const result = verifyDigest(path.join(dir, "blob"), digest);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("mismatch");

    await rm(dir, { recursive: true, force: true });
  });

  it("throws on tampered content when using verifyDigestOrThrow", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-sec-"));
    await writeFile(path.join(dir, "blob"), "tampered");

    expect(() =>
      verifyDigestOrThrow(
        path.join(dir, "blob"),
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toThrow();

    await rm(dir, { recursive: true, force: true });
  });

  it("passes for untampered content", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "kirakira-sec-"));
    const content = Buffer.from("verified content");
    const digest = sha256Prefixed(content);
    await writeFile(path.join(dir, "blob"), content);

    const result = verifyDigest(path.join(dir, "blob"), digest);
    expect(result.valid).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });
});
