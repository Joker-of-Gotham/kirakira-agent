import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { BlobCache } from "../../../packages/registry-client/src/cache.js";

describe("BlobCache", () => {
  let tmpDir: string;
  let cache: BlobCache;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "kirakira-cache-"));
    cache = new BlobCache(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes and reads blobs by digest", () => {
    const data = Buffer.from("hello cache");
    const digest = "sha256:abc123";
    cache.writeBlob(digest, data);

    expect(cache.hasBlob(digest)).toBe(true);
    const read = cache.readBlob(digest);
    expect(read?.toString()).toBe("hello cache");
  });

  it("returns null for missing blobs", () => {
    expect(cache.hasBlob("sha256:missing")).toBe(false);
    expect(cache.readBlob("sha256:missing")).toBeNull();
  });

  it("removes blobs", () => {
    const data = Buffer.from("temp");
    cache.writeBlob("sha256:del", data);
    expect(cache.hasBlob("sha256:del")).toBe(true);

    const removed = cache.removeBlob("sha256:del");
    expect(removed).toBe(true);
    expect(cache.hasBlob("sha256:del")).toBe(false);
  });

  it("returns false when removing nonexistent blob", () => {
    expect(cache.removeBlob("sha256:nope")).toBe(false);
  });

  it("writes and reads manifests", () => {
    const meta = { name: "test-skill", version: "1.0.0" };
    cache.writeManifest("test-skill", meta);
    const read = cache.readManifest<typeof meta>("test-skill");
    expect(read).toEqual(meta);
  });

  it("reports stats correctly", () => {
    cache.writeBlob("sha256:a", Buffer.alloc(100));
    cache.writeBlob("sha256:b", Buffer.alloc(200));
    cache.writeManifest("x", {});

    const stats = cache.stats();
    expect(stats.blobCount).toBe(2);
    expect(stats.totalBytes).toBe(300);
    expect(stats.manifests).toBe(1);
  });

  it("prunes oldest blobs to fit within maxBytes", async () => {
    cache.writeBlob("sha256:old", Buffer.alloc(500));
    await new Promise((r) => setTimeout(r, 50));
    cache.writeBlob("sha256:new", Buffer.alloc(300));

    const removed = cache.prune(400);
    expect(removed).toBe(1);
    expect(cache.hasBlob("sha256:old")).toBe(false);
    expect(cache.hasBlob("sha256:new")).toBe(true);
  });
});
