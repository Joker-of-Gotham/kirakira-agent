import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { writeLockFile, type LockFile } from "@kirakira/core";

describe("lockfile deterministic serialization", () => {
  it("two writes of same logical lock produce identical files", async () => {
    const payload: LockFile = {
      schemaVersion: 1,
      workspace: "det",
      generatedAt: "2026-05-04T16:00:00.000Z",
      packages: [
        {
          kind: "mcp",
          name: "tool",
          version: "2.0.0",
          source: "npm",
          digest: "sha256:" + "c".repeat(64),
          trust: "internal-signed",
        },
      ],
    };

    const a = await mkdtemp(path.join(os.tmpdir(), "kirakira-det-a-"));
    const b = await mkdtemp(path.join(os.tmpdir(), "kirakira-det-b-"));
    try {
      const pa = path.join(a, "x.lock");
      const pb = path.join(b, "x.lock");
      await writeLockFile(pa, payload);
      await writeLockFile(pb, payload);
      expect(await readFile(pa, "utf-8")).toBe(await readFile(pb, "utf-8"));
    } finally {
      await rm(a, { recursive: true, force: true });
      await rm(b, { recursive: true, force: true });
    }
  });
});
